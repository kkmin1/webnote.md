package server

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/zakirullin/files.md/server/fs"
	"github.com/zakirullin/files.md/server/pkg/txt"
)

var (
	Now       = time.Now
	mu        sync.Mutex
	userLocks map[string]*sync.Mutex

	inboxMarkerPrefix = regexp.MustCompile(`^- \[[ xX]\] `)
	inboxHeaderRegex  = regexp.MustCompile(`^#### `)
	// inboxEntryPrefix matches the prefix of an inbox entry: `- [ ] ` /
	// `- [x] ` marker followed by an optional `HH:MM` timestamp.
	inboxEntryPrefix = regexp.MustCompile(`^- \[[ xX]\] (?:` + "`" + `\d{2}:\d{2}` + "` )?")
)

// stripInboxEntryPrefix removes the optional `- [ ]` / `- [x] ` task marker
// and the “ `HH:MM` “ timestamp so only the entry body remains.
func stripInboxEntryPrefix(block string) string {
	return inboxEntryPrefix.ReplaceAllString(block, "")
}

// chatBlockHash returns a stable identifier for an inbox block. We hash only
// the timestamped first line (after stripping the `- [ ]`/`- [x] ` marker)
// so the identifier survives two mutations the bot makes to a block:
//   - completion toggle `- [ ]` ↔ `- [x]`
//   - forward-collapse appending continuation lines to the first block
//     (see saveFromTextMsg → createOrAdd). A keyboard built for message 1
//     must still resolve after message 2 is collapsed into the same block.
//
// Collision scope: two separate entries with the same “ `HH:MM` “ timestamp
// AND identical first line would hash the same. Per-minute resolution makes
// this rare in practice, and the outcome (acting on the older entry) is
// harmless — it's still the user's own content with the same first line.
// !!! TIME IS INCLUDED in the hash !!!
func chatBlockHash(block string) string {
	stripped := inboxMarkerPrefix.ReplaceAllString(block, "")
	firstLine := strings.SplitN(stripped, "\n", 2)[0]
	return fs.Hash(firstLine)
}

// findChatMsgByHash returns (blockIndex, block, true) for the first
// non-header block whose hash matches msgHash. Returns (-1, "", false) if no
// match is found.
func findChatMsgByHash(content, msgHash string) (int, string, bool) {
	blocks := readChatMsgs(content)
	for i, block := range blocks {
		if inboxHeaderRegex.MatchString(block) {
			continue
		}
		if chatBlockHash(block) == msgHash {
			return i, block, true
		}
	}
	return -1, "", false
}

// renameChatMsg replaces the body of the block identified by msgHash with
// newBody, preserving the `- [ ] `/`- [x] ` marker and the “ `HH:MM` “
// timestamp. Returns the rewritten file content.
func renameChatMsg(content, msgHash, newBody string) (string, error) {
	blocks := readChatMsgs(content)
	idx := -1
	for i, block := range blocks {
		if inboxHeaderRegex.MatchString(block) {
			continue
		}
		if chatBlockHash(block) == msgHash {
			idx = i
			break
		}
	}
	if idx == -1 {
		return "", fmt.Errorf("inbox block not found for hash %q", msgHash)
	}

	prefix := inboxEntryPrefix.FindString(blocks[idx])
	newBody = strings.TrimSpace(strings.ReplaceAll(newBody, "\n", " "))
	blocks[idx] = prefix + newBody

	return strings.Join(blocks, "\n"), nil
}

// appendToChatMsg appends newText to the chat block identified by msgHash,
// preserving the marker/timestamp prefix. The appended text becomes a new
// indented continuation line under the original entry.
func appendToChatMsg(content, msgHash, newText string) (string, error) {
	blocks := readChatMsgs(content)
	idx := -1
	for i, block := range blocks {
		if inboxHeaderRegex.MatchString(block) {
			continue
		}
		if chatBlockHash(block) == msgHash {
			idx = i
			break
		}
	}
	if idx == -1 {
		return "", fmt.Errorf("chat block not found for hash %q", msgHash)
	}

	newText = strings.TrimRight(newText, "\n")
	if newText == "" {
		return content, nil
	}
	blocks[idx] = strings.TrimRight(blocks[idx], "\n") + "\n" + newText

	return strings.Join(blocks, "\n"), nil
}

// appendToChat writes a new entry to Inbox.md and returns its stable hash.
func (b *Bot) appendToChat(content string, timezone *time.Location) (string, error) {
	exists, err := b.fs.Exists(fs.DirUserRoot, fs.ChatFilename)
	if err != nil {
		return "", fmt.Errorf("appendToInbox: %w", err)
	}

	content = strings.TrimSpace(content)

	var md string
	if exists {
		md, err = b.fs.Read(fs.DirUserRoot, fs.ChatFilename)
		if err != nil {
			return "", fmt.Errorf("appendToInbox: %w", err)
		}
		md = txt.NormNewLines(md)
		md = strings.TrimSpace(md)
		if len(md) != 0 {
			md += "\n"
		}
	}

	// Add today's header if it doesn't exist
	if !strings.Contains(md, todayHeader(timezone)) {
		md += todayHeader(timezone) + "\n"
	}

	// Format timestamp with timezone
	// TODO should we use timezone here?
	timestamp := now().In(timezone).Format("`15:04`")

	newEntry := fmt.Sprintf("- [ ] %s %s", timestamp, content)
	md += newEntry + "\n"

	if err := b.fs.Write(fs.DirUserRoot, fs.ChatFilename, md); err != nil {
		return "", fmt.Errorf("appendToInbox: %w", err)
	}

	return chatBlockHash(newEntry), nil
}

// moveFromChat passes the messages identified by msgHashes to the callback.
// On callback success, it removes those messages from the chat file.
// A msgHash is the stable hash returned by chatBlockHash; it survives the
// `[ ]` ↔ `[x]` completion toggle.
// On collapse=false the callback is called once per message.
func (b *Bot) moveFromChat(
	callback func(content string, timestamp time.Time) error,
	collapse bool,
	msgHashes ...string,
) error {
	key, err := b.fs.SafePath(fs.DirUserRoot, "")
	if err != nil {
		return fmt.Errorf("failed to get safe path: %w", err)
	}

	lock := userLock(key)
	lock.Lock()
	defer lock.Unlock()

	content, err := b.fs.Read(fs.DirUserRoot, fs.ChatFilename)
	if err != nil {
		return err
	}

	blocks := readChatMsgs(content)

	// Build hash -> block-index for every non-header block. Validate that all
	// requested hashes resolve to real blocks.
	hashToBlockIndex := make(map[string]int)
	hasAnyMsg := false
	for i, block := range blocks {
		if inboxHeaderRegex.MatchString(block) {
			continue
		}
		hasAnyMsg = true
		hashToBlockIndex[chatBlockHash(block)] = i
	}
	if !hasAnyMsg {
		return fmt.Errorf("no messages found")
	}
	resolvedBlockIndices := make([]int, 0, len(msgHashes))
	for _, h := range msgHashes {
		idx, ok := hashToBlockIndex[h]
		if !ok {
			// Recurring-schedule callback_data is tight on Telegram's 64-byte
			// limit so the picker truncates msgHash to its prefix. Fall back
			// to prefix match here.
			for full, i := range hashToBlockIndex {
				if strings.HasPrefix(full, h) {
					idx = i
					ok = true
					break
				}
			}
		}
		if !ok {
			return fmt.Errorf("msgHash %q not found in inbox", h)
		}
		resolvedBlockIndices = append(resolvedBlockIndices, idx)
	}

	// Process in ascending block-index order so removal later is deterministic.
	sort.Ints(resolvedBlockIndices)

	// Collect specified messages from inbox.
	var msgs []struct {
		content   string
		timestamp time.Time
		index     int
	}
	for _, blockIndex := range resolvedBlockIndices {
		block := blocks[blockIndex]

		// Find closest header above target msg for date context
		var headerDate string
		for i := blockIndex - 1; i >= 0; i-- {
			if inboxHeaderRegex.MatchString(blocks[i]) {
				headerDate = blocks[i]
				break
			}
		}

		// Strip optional `- [ ] ` / `- [x] ` marker, then optional `HH:MM`
		// timestamp. A plain checklist line without timestamp is treated as a
		// 00:00 entry on the header date.
		recordContent := inboxMarkerPrefix.ReplaceAllString(block, "")
		timeStr := "00:00"
		tsMatch := regexp.MustCompile("^`(\\d{2}:\\d{2})` ").FindStringSubmatch(recordContent)
		if tsMatch != nil {
			timeStr = tsMatch[1]
			recordContent = recordContent[len(tsMatch[0]):]
		}

		// Parse full timestamp from header date + time. Fall back to today
		// when the entry has no `#### date` header above it (plain `- [ ] body`).
		var timestamp time.Time
		dateRegex := regexp.MustCompile(`^#### (\d{1,2}) ([A-Za-z]+), [A-Za-z]+`)
		dateMatches := dateRegex.FindStringSubmatch(headerDate)
		if len(dateMatches) >= 3 {
			dateTimeStr := fmt.Sprintf("%s %s %s", dateMatches[1], dateMatches[2], timeStr)
			parsed, err := time.Parse("2 January 15:04", dateTimeStr)
			if err != nil {
				return fmt.Errorf("failed to parse timestamp for block %d: %w", blockIndex, err)
			}
			timestamp = parsed
		} else {
			today := now()
			t, err := time.Parse("15:04", timeStr)
			if err == nil {
				timestamp = time.Date(today.Year(), today.Month(), today.Day(), t.Hour(), t.Minute(), 0, 0, today.Location())
			} else {
				timestamp = today
			}
		}

		msgs = append(msgs, struct {
			content   string
			timestamp time.Time
			index     int
		}{
			content:   recordContent,
			timestamp: timestamp,
			index:     blockIndex,
		})
	}

	// First we save all the messages to files, only then we remove them from the inbox.
	if collapse {
		content := strings.Builder{}
		for _, msg := range msgs {
			content.WriteString(msg.content)
			content.WriteString("\n")
		}
		err = callback(strings.TrimSpace(content.String()), msgs[0].timestamp)
		if err != nil {
			return fmt.Errorf("callback failed: %w", err)
		}
	} else {
		for _, msg := range msgs {
			if err := callback(msg.content, msg.timestamp); err != nil {
				return fmt.Errorf("callback failed: %w", err)
			}
		}
	}

	blocksToRemove := make(map[int]bool)
	for _, msg := range msgs {
		blocksToRemove[msg.index] = true
	}
	newBlocks := make([]string, 0)
	for i, block := range blocks {
		if blocksToRemove[i] {
			continue
		}
		newBlocks = append(newBlocks, block)
	}
	modifiedContent := strings.TrimSpace(strings.Join(newBlocks, "\n"))

	return b.fs.Write(fs.DirUserRoot, fs.ChatFilename, modifiedContent)
}

// readChatMsgs parses content into logical blocks
// Returns slice where each element is either a header or a complete record
func readChatMsgs(content string) []string {
	content = txt.NormNewLines(content)
	lines := strings.Split(content, "\n")

	headerRegex := regexp.MustCompile(`^#### `)
	// Block start: a `- [ ] ` / `- [x] ` checklist line (timestamp optional).
	timestampRegex := regexp.MustCompile(`^- \[[ xX]\] `)

	var blocks []string
	var currentBlock strings.Builder

	for _, line := range lines {
		isHeader := headerRegex.MatchString(line)
		isTimestamp := timestampRegex.MatchString(line)

		if isHeader {
			// Save previous block if exists
			if currentBlock.Len() > 0 {
				blocks = append(blocks, strings.TrimSpace(currentBlock.String()))
				currentBlock.Reset()
			}
			// DisplayName is always its own block
			blocks = append(blocks, line)
		} else if isTimestamp {
			// Save previous block if exists
			if currentBlock.Len() > 0 {
				blocks = append(blocks, strings.TrimSpace(currentBlock.String()))
				currentBlock.Reset()
			}
			// Start new block with timestamp
			currentBlock.WriteString(line)
		} else {
			// Continue current block or start new block
			if currentBlock.Len() > 0 {
				currentBlock.WriteString("\n")
				currentBlock.WriteString(line)
			} else {
				currentBlock.WriteString(line)
			}
		}
	}

	// Add final block
	if currentBlock.Len() > 0 {
		blocks = append(blocks, strings.TrimSpace(currentBlock.String()))
	}

	return blocks
}

func todayHeader(timezone *time.Location) string {
	nowTZ := now().In(timezone)
	return fmt.Sprintf("#### %d %s, %s", nowTZ.Day(), nowTZ.Format("January"), nowTZ.Weekday())
}

func userLock(rootPath string) *sync.Mutex {
	mu.Lock()
	defer mu.Unlock()

	if userLocks == nil {
		userLocks = make(map[string]*sync.Mutex)
	}
	if lock, exists := userLocks[rootPath]; exists {
		return lock
	}

	newLock := &sync.Mutex{}
	userLocks[rootPath] = newLock

	return newLock
}
