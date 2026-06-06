package i18n

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
)

var emojisByKeyword map[string]string

//go:embed emojis.json
var emojisJSON string

func LoadEmojiFile() {
	var emojis map[string][]string
	err := json.Unmarshal([]byte(emojisJSON), &emojis)
	if err != nil {
		panic(fmt.Errorf("i18n.loadEmojiFile: can't unmarshal: %w", err))
	}

	emojisByKeyword = make(map[string]string)
	for emoji, keywords := range emojis {
		for _, keyword := range keywords {
			emojisByKeyword[keyword] = emoji
		}
	}
}

// AddEmoji adds auto emoji to a string based on keywords.
// TODO add split to spaces etc
func AddEmoji(str string) string {
	emoji := Emoji(str)
	if len(emoji) == 0 {
		return str
	}

	return fmt.Sprintf("%s %s", emoji, str)
}

func Emoji(str string) string {
	if len(emojisByKeyword) == 0 {
		LoadEmojiFile()
	}

	strLower := strings.ToLower(str)
	aliases := []string{strLower, strLower + "s", strings.TrimSuffix(strLower, "s")}
	for _, alias := range aliases {
		icon := emojisByKeyword[alias]
		if icon != "" {
			return icon
		}
	}

	for _, word := range strings.Fields(strLower) {
		icon := emojisByKeyword[word]
		if icon != "" {
			return icon
		}
	}

	return ""
}
