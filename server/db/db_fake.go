package db

import (
	"github.com/zakirullin/files.md/server/pkg/tg"
)

// FakeDB is a fake database, used for testing
// We don't have to clear it after each test
type FakeDB struct {
	HashOrPathByMID     string
	InputExpectationCMD *tg.Cmd
	LastKeyboardMID     int
	RecentCMD           string
	RecentCMDParams     []string
}

func NewFakeDB() *FakeDB {
	return &FakeDB{LastKeyboardMID: -1}
}

func (db *FakeDB) LastKeyboardMsgID() (int, bool) {
	if db.LastKeyboardMID == -1 {
		return 0, false
	}

	return db.LastKeyboardMID, true
}

func (db *FakeDB) SetLastKeyboardMsgID(msgID int) {
	db.LastKeyboardMID = msgID
}

func (db *FakeDB) DelLastKeyboardMsgID() {
	db.LastKeyboardMID = -1
}

func (db *FakeDB) InputExpectation() *tg.Cmd {
	return db.InputExpectationCMD
}

func (db *FakeDB) SetInputExpectation(cmd tg.Cmd) {
	db.InputExpectationCMD = &cmd
}

func (db *FakeDB) DelInputExpectation() {
	db.InputExpectationCMD = nil
}

func (db *FakeDB) HashOrPathByMsgID(msgID int) (string, bool) {
	return db.HashOrPathByMID, db.HashOrPathByMID != ""
}

func (db *FakeDB) SetHashOrPathByMsgID(msgID int, value string) {
	db.HashOrPathByMID = value
}

func (db *FakeDB) RecentCommand() (string, bool) {
	return db.RecentCMD, db.RecentCMD != ""
}

func (db *FakeDB) SetRecentCommand(cmd string) {
	db.RecentCMD = cmd
}

func (db *FakeDB) RecentCommandParams() ([]string, bool) {
	return db.RecentCMDParams, len(db.RecentCMDParams) > 0
}

func (db *FakeDB) SetRecentCommandParams(params []string) {
	db.RecentCMDParams = params
}

func (db *FakeDB) AddImgMsgID(msgID int) {
}

func (db *FakeDB) ImgMsgID() ([]int, bool) {
	return nil, false
}

func (db *FakeDB) DelImgMsgID() {
}
