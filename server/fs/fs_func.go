package fs

import (
	"crypto/md5"
	"encoding/hex"
	"path/filepath"
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/zakirullin/files.md/server/config"
	"github.com/zakirullin/files.md/server/pkg/txt"
)

// ForbiddenChars hold replacements for characters
// not allowed in some envs like Windows, PWA apps.
// Under Linux and other Unix-related systems,
// there are only two characters that cannot
// appear in the name of a file or directory,
// and those are NUL '\0' and slash '/'.
var ForbiddenChars = map[string]string{
	"<":  "＜",
	">":  "＞",
	":":  "꞉",
	"\"": "″",
	"|":  "⼁",
	"\\": "＼",
	"?":  "？",
	"*":  "﹡",
	// Forbidden on Unix.
	"\x00": "",
	"/":    "／",
}

func SanitizeFilename(filename string) string {
	for forbidden, safe := range ForbiddenChars {
		filename = strings.ReplaceAll(filename, forbidden, safe)
	}

	return filename
}

func UnsanitizeFilename(filename string) string {
	for forbidden, safe := range ForbiddenChars {
		if safe == "" {
			continue
		}

		filename = strings.ReplaceAll(filename, safe, forbidden)
	}

	return filename
}

func DisplayName(filename string) string {
	return txt.Ucfirst(strings.TrimSuffix(strings.TrimSpace(filename), MDExt))
}

func Hash(filename string) string {
	hash := md5.Sum([]byte(filename))
	return hex.EncodeToString(hash[:])[:11]
}

// ShortHash returns a short hash of the filename
// Telegram only allows 64 bytes in callback_data,
// so if we have 3 params we should use shortHash.
// More collisions are possible, but it's a trade-off.
func ShortHash(filename string) string {
	hash := md5.Sum([]byte(filename))
	return hex.EncodeToString(hash[:])[:5]
}

func ExcludeChecklists(dirs []File) []File {
	var newDirs []File
	for _, dir := range dirs {
		isChecklist := strings.HasPrefix(dir.Name, "_") && strings.HasSuffix(dir.Name, "_")
		if isChecklist {
			continue
		}

		newDirs = append(newDirs, dir)
	}

	return newDirs
}

func ExcludeSystemDirs(dirs []File) []File {
	var newDirs []File
	for _, dir := range dirs {
		if slices.Contains([]string{DirMedia, DirArchive, DirJournal, DirInsights, "img"}, dir.Name) {
			continue
		}

		newDirs = append(newDirs, dir)
	}

	return newDirs
}

func ExcludeConfig(files []File) []File {
	var newFiles []File
	for _, file := range files {
		if file.Name == config.ServerCfg.ConfigFilename && file.ParentDir == DirUserRoot {
			continue
		}

		newFiles = append(newFiles, file)
	}

	return newFiles
}

func OnlyNoteDirs(dirs []File) []File {
	return ExcludeSystemDirs(ExcludeChecklists(dirs))
}

func OnlyChecklists(dirs []File) []File {
	entries := OnlyFiles(dirs)

	var checklists []File
	for _, entry := range entries {
		if filepath.Ext(entry.Name) != MDExt {
			continue
		}
		filename := strings.TrimSuffix(entry.Name, MDExt)
		hasChecklistPostfix := strings.HasSuffix(filename, "_")
		if hasChecklistPostfix || slices.Contains([]string{
			WatchFilename,
			ReadFilename,
			ShopFilename,
		}, entry.Name) {
			checklists = append(checklists, entry)
		}
	}

	return checklists
}

func OnlyUserMDFiles(entries []File) []File {
	systemFiles := []string{
		ChatFilename,
		LaterFilename,
		DoneFilename,
		ChatFilename,
		ShopFilename,
		WatchFilename,
		ReadFilename,
	}

	var files []File
	for _, file := range entries {
		if file.IsDir {
			continue
		}
		if filepath.Ext(file.Name) != MDExt {
			continue
		}
		if slices.Contains(systemFiles, file.Name) {
			continue
		}
		files = append(files, file)
	}
	return files
}

func OnlyFiles(entries []File) []File {
	var files []File
	for _, file := range entries {
		if file.IsDir {
			continue
		}

		files = append(files, file)
	}

	return files
}

func OnlyDirs(entries []File) []File {
	var dirs []File
	for _, file := range entries {
		if !file.IsDir {
			continue
		}

		dirs = append(dirs, file)
	}

	return dirs
}

// OnlyUserDirs returns only directories that look like user IDs
func OnlyUserDirs(entries []File) []File {
	var dirs []File
	for _, file := range entries {
		if !file.IsDir {
			continue
		}
		if _, err := strconv.Atoi(file.Name); err != nil {
			continue
		}

		dirs = append(dirs, file)
	}

	return dirs
}

func OnlyFilenames(entries []File) []string {
	var filenames []string
	for _, entry := range entries {
		filenames = append(filenames, entry.Name)
	}

	return filenames
}

func SortByCtimeDesc(entries []File) []File {
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Ctime > entries[j].Ctime
	})

	return entries
}
