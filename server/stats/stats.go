// Package stats generates fancy reports
// containing completed tasks and habits, checked items and so on
package stats

import (
	"fmt"
	"strings"
	"time"

	"github.com/zakirullin/files.md/server/db"
	"github.com/zakirullin/files.md/server/fs"
)

var now = time.Now

func beginningOfTheDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

// TODO db is necessary?
func TodayReport(userFS *fs.FS, db any, userID int64) (string, error) {
	files, err := DoneToday(userFS, db, userID)
	if err != nil {
		return "", fmt.Errorf("stats.TodayReport: %w", err)
	}

	var stats []string
	for _, file := range files {
		stats = append(stats, fmt.Sprintf("%s <b>%s</b>", emoji(file), fs.DisplayName(file)))
	}

	archivedFiles, err := userFS.FilesAndDirs(fs.DirArchive)
	if err != nil {
		return "", fmt.Errorf("stats.TodayReport: can't get trashed files: %w", err)
	}
	doneTotal := len(archivedFiles)
	stats = append(stats, fmt.Sprintf("\n📊 %d tasks done in total", doneTotal))

	return strings.Join(stats, "\n"), nil
}

func emoji(filename string) string {
	if fs.IsChecklistItem(filename) {
		return "☑️"
	}

	return "✅"
}

func DoneToday(userFS *fs.FS, db any, userID int64) ([]string, error) {
	return doneToday(userFS, db, userID, false)
}

func DoneTodayScheduled(userFS *fs.FS, db *db.DB, userID int64) ([]string, error) {
	return doneToday(userFS, db, userID, true)
}

func doneToday(userFS *fs.FS, db any, userID int64, withScheduled bool) ([]string, error) {
	files, err := userFS.FilesAndDirs(fs.DirArchive)
	if err != nil {
		return nil, fmt.Errorf("stats.DoneTasks: %w", err)
	}

	var todayFiles []fs.File
	for _, task := range files {
		if task.Ctime > beginningOfTheDay(now()).Unix() {
			todayFiles = append(todayFiles, task)
		}
	}

	//sch, err := db.Schedule(userID)
	//if err != nil {
	//	return nil, fmt.Errorf("stats.DoneTasks: %w", err)
	//}

	var done []string
	for _, todayFile := range todayFiles {
		done = append(done, todayFile.DisplayName)
	}

	return done, nil
}
