package txt

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPositiveI64ToStr(t *testing.T) {
	r := require.New(t)

	s := I64(1)

	r.Equal("1", s)
}

func TestNegativeI64ToStr(t *testing.T) {
	r := require.New(t)

	s := I64(-1)

	r.Equal("-1", s)
}

func TestZeroI64ToStr(t *testing.T) {
	r := require.New(t)

	s := I64(0)

	r.Equal("0", s)
}

func TestUcfirst(t *testing.T) {
	r := require.New(t)

	res := Ucfirst("abc")

	r.Equal("Abc", res)
}

func TestUcfirstRu(t *testing.T) {
	r := require.New(t)

	res := Ucfirst("абв")

	r.Equal("Абв", res)
}

func TestLcfirst(t *testing.T) {
	r := require.New(t)

	res := Lcfirst("ABC")

	r.Equal("aBC", res)
}

func TestLcfirstRu(t *testing.T) {
	r := require.New(t)

	res := Lcfirst("АБВ")

	r.Equal("аБВ", res)
}

func TestInsertExtAfterHeader(t *testing.T) {
	r := require.New(t)

	content := AddHeaderAndText("#### 1 January 1970, Thursday\nExisting\ncontent", "#### 1 January 1970, Thursday", "New\ncontent")
	r.Equal("#### 1 January 1970, Thursday\nExisting\ncontent\nNew\ncontent", content)
}

func TestInsertTextAfterHeaderNoHeader(t *testing.T) {
	r := require.New(t)
	content := AddHeaderAndText("### header 1\nitem1\nitem2", "### header 5", "new item")
	r.Equal("### header 5\nnew item\n\n### header 1\nitem1\nitem2", content)
}

func TestInsertTextAfterHeaderAtEnd(t *testing.T) {
	r := require.New(t)
	content := AddHeaderAndText("### header 1\nitem1\nitem2\n### header 2", "### header 1", "new item")
	r.Equal("### header 1\nitem1\nitem2\nnew item\n\n### header 2", content)
}

func TestInsertTextAfterHeaderInMiddle(t *testing.T) {
	r := require.New(t)
	content := AddHeaderAndText("### header 0\n### header 1\nitem1\nitem2\n### header 2", "### header 1", "new item")
	r.Equal("### header 0\n### header 1\nitem1\nitem2\nnew item\n\n### header 2", content)
}

func TestInsertTextAfterHeaderWithOnlyHeader(t *testing.T) {
	r := require.New(t)
	content := AddHeaderAndText("### header 0\n### header 1\n### header 2", "### header 1", "new item")
	r.Equal("### header 0\n### header 1\nnew item\n\n### header 2", content)
}

func TestInsertTextAfterHeaderAtVeryEnd(t *testing.T) {
	r := require.New(t)
	content := AddHeaderAndText("### header 1\nitem1\nitem2", "### header 1", "new item")
	r.Equal("### header 1\nitem1\nitem2\nnew item", content)
}

func TestInsertTextAfterNoHeader(t *testing.T) {
	r := require.New(t)
	content := AddHeaderAndText("item1\nitem2", "### header 1", "new item")
	r.Equal("### header 1\nnew item\n\nitem1\nitem2", content)
}

func TestSplitTextIntoChunks(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		maxLen   int
		expected []string
	}{
		{
			name:     "basic split with spaces",
			input:    "This is a test to check the splitting of text",
			maxLen:   10,
			expected: []string{"This is a", "test to", "check the", "splitting", "of text"},
		},
		{
			name:     "split with newlines",
			input:    "Line one\nLine two\nLine three",
			maxLen:   15,
			expected: []string{"Line one", "Line two", "Line three"},
		},
		{
			name:     "long string without spaces",
			input:    "supercalifragilisticexpialidocious",
			maxLen:   10,
			expected: []string{"supercalif", "ragilistic", "expialidoc", "ious"},
		},
		{
			name:     "exact match",
			input:    "ExactMatch",
			maxLen:   10,
			expected: []string{"ExactMatch"},
		},
		{
			name:     "trailing and leading spaces",
			input:    "   Leading and trailing spaces   ",
			maxLen:   15,
			expected: []string{"Leading and", "trailing spaces"},
		},
		{
			name:     "no split needed",
			input:    "Short text",
			maxLen:   50,
			expected: []string{"Short text"},
		},
		{
			name:     "empty string",
			input:    "",
			maxLen:   10,
			expected: []string{""},
		},
		{
			name:     "string with only spaces",
			input:    "                                            ",
			maxLen:   10,
			expected: []string{""},
		},
		{
			name:     "string with only spaces",
			input:    "aaa",
			maxLen:   2,
			expected: []string{"aa", "a"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := SplitTextIntoChunks(tt.input, tt.maxLen)
			require.Equal(t, tt.expected, res)
		})
	}
}

func TestNormNewLines(t *testing.T) {
	// Initialize the test cases
	testCases := []struct {
		input          string
		expectedOutput string
	}{
		// Test Case 1: Windows-style line endings
		{input: "Hello\r\nWorld", expectedOutput: "Hello\nWorld"},

		// Test Case 2: Mac OS line endings
		{input: "Line1\rLine2\nLine3", expectedOutput: "Line1\nLine2\nLine3"},

		// Test Case 3: Unix-style line endings (no change expected)
		{input: "This\nis\na\ntest", expectedOutput: "This\nis\na\ntest"},

		// Test Case 4: No line endings
		{input: "NoLineEndingsHere", expectedOutput: "NoLineEndingsHere"},
	}

	for _, tc := range testCases {
		output := NormNewLines(tc.input)
		require.Equal(t, tc.expectedOutput, output, "Input: %s", tc.input)
	}
}

func TestEmoji(t *testing.T) {
	// Test with a valid emoji
	res := Emoji("😊", "Hello")
	require.Equal(t, "😊 Hello", res)

	// Test with an empty emoji (should just return the string)
	res = Emoji("", "Hello")
	require.Equal(t, "Hello", res)

	// Test with a different emoji
	res = Emoji("🎉", "Congratulations")
	require.Equal(t, "🎉 Congratulations", res)

	// Test with an empty string for str
	res = Emoji("🎉", "")
	require.Equal(t, "🎉 ", res)

	// Test with both emoji and str empty
	res = Emoji("", "")
	require.Equal(t, "", res)
}

func TestSubstr(t *testing.T) {
	// Basic test case
	require.Equal(t, "ello", Substr("hello", 1, 4), "Should return 'ello'")

	// Test start index beyond string length
	require.Equal(t, "", Substr("hello", 10, 2), "Should return empty string for out-of-bound start index")

	// Test length exceeding string length
	require.Equal(t, "hello", Substr("hello", 0, 10), "Should return entire string when length exceeds")

	// Test empty string
	require.Equal(t, "", Substr("", 0, 1), "Should return empty string when input is empty")

	// Test Unicode characters (basic)
	require.Equal(t, "界", Substr("世界", 1, 1), "Should return '界' for unicode characters")

	// Test handling of emoji (simple)
	require.Equal(t, "👋", Substr("👋🌍", 0, 1), "Should return first emoji '👋'")

	// Test handling of emoji with skin tone (skin tone modifier counts as 2 codepoints)
	require.Equal(t, "👋🏻", Substr("👋🏻🌍", 0, 2), "Should return first emoji with skin tone modifier '👋🏻'")

	// Test for slicing emoji across boundaries (shouldn't break)
	require.Equal(t, "👋🏻", Substr("👋🏻🌍", 0, 2), "Should return the entire emoji with modifier '👋🏻'")

	// Test when slicing exceeds bounds with emoji and unicode characters
	require.Equal(t, "👋🏻🌍", Substr("👋🏻🌍", 0, 5), "Should return the whole string with emoji and modifier")

	// Test invalid range where length is 0
	require.Equal(t, "", Substr("hello", 0, 0), "Should return an empty string when length is 0")
}

func TestFirstWord(t *testing.T) {
	// Basic test case
	require.Equal(t, "Hello", FirstWord("Hello world!"), "Should return 'Hello' as the first word")

	// Test with leading spaces
	require.Equal(t, "Hello", FirstWord("   Hello world!"), "Should trim leading spaces and return 'Hello'")

	// Test with trailing spaces
	require.Equal(t, "Hello", FirstWord("Hello world!   "), "Should trim trailing spaces and return 'Hello'")

	// Test with punctuation
	require.Equal(t, "Hello", FirstWord("Hello, world!"), "Should return 'Hello' ignoring punctuation")

	// Test empty string
	require.Equal(t, "", FirstWord(""), "Should return an empty string for an empty input")

	// Test with only spaces
	require.Equal(t, "", FirstWord("     "), "Should return an empty string for spaces only")

	// Test with only punctuation
	require.Equal(t, "", FirstWord(",.!?"), "Should return an empty string for only punctuation")

	// Test with multiple words and punctuation
	require.Equal(t, "This", FirstWord("This is a sentence!"), "Should return 'This'")

	// Test with non-ASCII characters
	require.Equal(t, "первое", FirstWord("первое слово"), "Should return the first non-ASCII word 'первое'")

	// Test with hyphenated word
	require.Equal(t, "Hello", FirstWord("Hello-world!"), "Should return 'Hello' before the hyphen")
}

func TestEscapeHTML(t *testing.T) {
	// Basic test case
	require.Equal(t, "&lt;div&gt;", EscapeHTML("<div>"), "Should escape '<' and '>' into '&lt;' and '&gt;'")

	// Test escaping ampersand
	require.Equal(t, "&amp;hello&amp;", EscapeHTML("&hello&"), "Should escape '&' into '&amp;'")

	// Test escaping mixed characters
	require.Equal(t, "&lt;div&gt; &amp; text", EscapeHTML("<div> & text"), "Should escape both '<', '>' and '&'")

	// Test string without special characters
	require.Equal(t, "Hello World", EscapeHTML("Hello World"), "Should return the same string if no HTML special characters")

	// Test string with all special characters
	require.Equal(t, "&amp;&lt;&gt;", EscapeHTML("&<>"), "Should escape '&', '<', and '>'")

	// Test empty string
	require.Equal(t, "", EscapeHTML(""), "Should return an empty string when input is empty")

	// Test string with multiple occurrences of the same special characters
	require.Equal(t, "&lt;&lt;&lt;tag&gt;&gt;&gt;", EscapeHTML("<<<tag>>>"), "Should escape all occurrences of '<' and '>'")
}

func TestStripHTMLTags(t *testing.T) {
	// Basic test case
	require.Equal(t, "Hello World", StripHTMLTags("<div>Hello World</div>"), "Should strip basic HTML tags")

	// Test with multiple tags
	require.Equal(t, "Hello World", StripHTMLTags("<div><p>Hello</p> <b>World</b></div>"), "Should strip multiple HTML tags")

	// Test with self-closing tags
	require.Equal(t, "Hello", StripHTMLTags("<img src='test.jpg' />Hello"), "Should strip self-closing tags")

	// Test with no HTML tags
	require.Equal(t, "Plain text", StripHTMLTags("Plain text"), "Should return the same string if no HTML tags are present")

	// Test with empty string
	require.Equal(t, "", StripHTMLTags(""), "Should return an empty string when input is empty")

	// Test with tag attributes
	require.Equal(t, "Hello", StripHTMLTags("<a href='https://example.com'>Hello</a>"), "Should strip tags and their attributes")

	// Test with nested tags
	require.Equal(t, "Nested tags", StripHTMLTags("<div><span>Nested</span> tags</div>"), "Should strip nested HTML tags")

	// Test with special characters
	require.Equal(t, "1 > 0", StripHTMLTags("1 > 0"), "Should retain special characters like '>' when not in a tag")

	// Test with incomplete tags
	require.Equal(t, "Text with <tag", StripHTMLTags("Text with <tag"), "Should retain incomplete tags as plain text")
}

func TestReplaceWithPlaceholders(t *testing.T) {
	// Basic test case
	str, placeholders := ReplaceWithPlaceholders("Hello World, Hello Universe", "Hello", "placeholder")
	require.Equal(t, "#placeholder0# World, #placeholder1# Universe", str, "Should replace 'Hello' with placeholders")
	require.Equal(t, map[string]string{
		"#placeholder0#": "Hello",
		"#placeholder1#": "Hello",
	}, placeholders, "Should map placeholders to their original matches")

	// Test with numbers
	str, placeholders = ReplaceWithPlaceholders("123-456-7890 and 987-654-3210", `\d{3}-\d{3}-\d{4}`, "phone")
	require.Equal(t, "#phone0# and #phone1#", str, "Should replace phone numbers with placeholders")
	require.Equal(t, map[string]string{
		"#phone0#": "123-456-7890",
		"#phone1#": "987-654-3210",
	}, placeholders, "Should map placeholders to phone numbers")

	// Test with special characters
	str, placeholders = ReplaceWithPlaceholders("email@example.com and test@example.org", `\S+@\S+\.\S+`, "email")
	require.Equal(t, "#email0# and #email1#", str, "Should replace emails with placeholders")
	require.Equal(t, map[string]string{
		"#email0#": "email@example.com",
		"#email1#": "test@example.org",
	}, placeholders, "Should map placeholders to emails")

	// Test with no matches
	str, placeholders = ReplaceWithPlaceholders("No matches here", `\d+`, "num")
	require.Equal(t, "No matches here", str, "Should return the original string if no matches")
	require.Empty(t, placeholders, "Should return an empty map if no matches are found")

	// Test with empty string
	str, placeholders = ReplaceWithPlaceholders("", `\d+`, "num")
	require.Equal(t, "", str, "Should return an empty string if input is empty")
	require.Empty(t, placeholders, "Should return an empty map if input is empty")
}

func TestRestoreFromPlaceholders(t *testing.T) {
	// Basic test case
	str := "Hello #placeholder0#, Welcome to #placeholder1#!"
	placeholders := map[string]string{
		"#placeholder0#": "World",
		"#placeholder1#": "Earth",
	}
	require.Equal(t, "Hello World, Welcome to Earth!", RestoreFromPlaceholders(str, placeholders), "Should restore placeholders to original values")

	// Test with multiple occurrences of the same placeholder
	str = "#placeholder0# and #placeholder0# are the same"
	placeholders = map[string]string{
		"#placeholder0#": "X",
	}
	require.Equal(t, "X and X are the same", RestoreFromPlaceholders(str, placeholders), "Should replace all occurrences of the same placeholder")

	// Test with no placeholders
	str = "No placeholders here"
	placeholders = map[string]string{}
	require.Equal(t, "No placeholders here", RestoreFromPlaceholders(str, placeholders), "Should return original string when no placeholders")

	// Test with empty string
	str = ""
	placeholders = map[string]string{
		"#placeholder0#": "X",
	}
	require.Equal(t, "", RestoreFromPlaceholders(str, placeholders), "Should return empty string when input is empty")

	// Test with placeholders not in the string
	str = "No matching placeholders"
	placeholders = map[string]string{
		"#placeholder1#": "Y",
	}
	require.Equal(t, "No matching placeholders", RestoreFromPlaceholders(str, placeholders), "Should return the original string if placeholder is not found")
}
