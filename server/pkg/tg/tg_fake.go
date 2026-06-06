package tg

import (
	"io"
)

type Message struct {
	Text    string
	Buttons []Row
}

type FakeTG struct {
	SentTexts          []string
	LastSentText       string
	LastEditedText     string
	LastSentKeyboard   *Keyboard
	LastEditedKeyboard *Keyboard
	InlineQueryResults []any
	LastSentMessageID  int
	Messages           []Message
	EditedMessages     []Message
}

func NewFakeTG() *FakeTG {
	return &FakeTG{}
}

func (f *FakeTG) Send(userID int64, text string, kb *Keyboard, markup string) (int, error) {
	f.LastSentText = text
	f.SentTexts = append(f.SentTexts, text)
	f.LastSentKeyboard = kb
	f.LastEditedKeyboard = nil
	f.LastEditedText = ""
	f.LastSentMessageID++

	msg := Message{
		Text: text,
	}
	if kb != nil {
		msg.Buttons = kb.Btns
	}
	f.Messages = append(f.Messages, msg)

	return f.LastSentMessageID, nil
}

func (tg *FakeTG) SendImages(userID int64, images []string) ([]int, error) {
	return nil, nil
}

func (tg *FakeTG) SendReaction(userID int64, msgID int, reaction string) error { return nil }

func (f *FakeTG) Edit(userID int64, msgID int, text string, kb *Keyboard, markup string) error {
	f.LastEditedText = text
	f.LastEditedKeyboard = kb
	f.LastSentKeyboard = nil

	msg := Message{
		Text: text,
	}
	if kb != nil {
		msg.Buttons = kb.Btns
	}
	f.EditedMessages = append(f.EditedMessages, msg)

	return nil
}

func (f *FakeTG) Del(userID int64, msgID int) error {
	return nil
}

func (f *FakeTG) AnswerCallbackQuery(queryID string, text string) error {
	return nil
}

func (f *FakeTG) AnswerInlineQuery(queryID string, results []interface{}, cacheTime int, offset string) error {
	f.InlineQueryResults = results
	return nil
}

func (f *FakeTG) DownloadFile(fileID string, writer io.Writer) (string, error) {
	return "", nil
}

func (f *FakeTG) ChannelCreatorID(chatID int64) (int64, error) {
	return 0, nil
}
