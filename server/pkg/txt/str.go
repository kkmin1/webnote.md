package txt

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

func I64(i int64) string {
	return strconv.FormatInt(i, 10)
}

func Ucfirst(str string) string {
	if len(str) == 0 {
		return str
	}
	r := []rune(str)

	return string(unicode.ToUpper(r[0])) + string(r[1:])
}

func Lcfirst(str string) string {
	if len(str) == 0 {
		return str
	}
	r := []rune(str)

	return string(unicode.ToLower(r[0])) + string(r[1:])
}

// Substr respects unicode codepoints, but not multi-unicode-codepoint aware.
// Specifying skintone or gender of an emoji will count as 2 codepoints:
// https://unicode.org/emoji/charts/full-emoji-modifiers.html
func Substr(input string, start int, length int) string {
	asRunes := []rune(input)
	if start >= len(asRunes) {
		return ""
	}

	if start+length > len(asRunes) {
		length = len(asRunes) - start
	}

	return string(asRunes[start : start+length])
}

func Emoji(emoji, str string) string {
	if emoji == "" {
		return str
	}

	// Custom for George :)
	str = strings.TrimPrefix(str, "WRK ")
	str = strings.TrimPrefix(str, "UA ")
	str = strings.TrimPrefix(str, "US ")
	str = strings.TrimPrefix(str, "CY ")
	str = strings.TrimPrefix(str, "HOB ")
	str = strings.TrimPrefix(str, "SRB ")
	str = strings.TrimPrefix(str, "PL ")

	return fmt.Sprintf("%s %s", emoji, str)
}

func NormNewLines(text string) string {
	text = strings.Replace(text, "\r\n", "\n", -1) // replace Windows line endings
	return strings.Replace(text, "\r", "\n", -1)   // replace remaining Mac line endings
}

func IsMultiline(text string) bool {
	text = NormNewLines(text)
	lines := strings.Split(text, "\n")
	return len(lines) > 1
}

// SplitTextIntoChunks splits the text into chunks less than or equal to maxLen.
// The chunks are split at the last new line or space before maxLen (inclusive).
// Spaces-like characters are trimmed out from the beginning and the end of each chunk.
func SplitTextIntoChunks(text string, maxLen int) []string {
	text = strings.TrimSpace(text)

	if maxLen <= 0 {
		return []string{text}
	}

	var chunks []string
	runes := []rune(text) // Convert the string to runes

	for len(runes) > maxLen {
		// Find the split index
		splitIndex := -1
		subStr := runes[:maxLen]
		// Find the last newline in the substring
		for i := len(subStr) - 1; i >= 0; i-- {
			if subStr[i] == '\n' {
				splitIndex = i
				break
			}
		}
		if splitIndex == -1 {
			// No newline found, find the last space
			for i := len(subStr) - 1; i >= 0; i-- {
				if subStr[i] == ' ' {
					splitIndex = i
					break
				}
			}
		}
		if splitIndex == -1 {
			// No space found either, split at maxLen
			splitIndex = maxLen
		}

		trimmedSubStr := strings.TrimSpace(string(runes[:splitIndex]))
		if len(trimmedSubStr) > 0 {
			chunks = append(chunks, trimmedSubStr)
		}
		runes = runes[splitIndex:]
		runes = []rune(strings.TrimSpace(string(runes)))
	}

	// Add the remaining runes as the final chunk
	chunks = append(chunks, strings.TrimSpace(string(runes)))

	return chunks
}

func FirstWord(str string) string {
	str = strings.TrimSpace(str)
	re := regexp.MustCompile(`^[^\s\p{P}]+`)
	return re.FindString(str)
}

func EscapeHTML(str string) string {
	// HTML escaping
	htmlEscaper := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
	)

	return htmlEscaper.Replace(str)
}

func StripHTMLTags(str string) string {
	re := regexp.MustCompile(`<[^>]*>`)
	return re.ReplaceAllString(str, "")
}

func ReplaceWithPlaceholders(str, regex, placeholder string) (string, map[string]string) {
	re := regexp.MustCompile(regex)
	placeholders := make(map[string]string)
	counter := 0

	// Function to replace each match with a placeholder
	res := re.ReplaceAllStringFunc(str, func(match string) string {
		p := fmt.Sprintf("#%s%d#", placeholder, counter)
		placeholders[p] = match
		counter++
		return p
	})

	return res, placeholders
}

func RestoreFromPlaceholders(str string, placeholders map[string]string) string {
	for placeholder, original := range placeholders {
		str = strings.ReplaceAll(str, placeholder, original)
	}
	return str
}
