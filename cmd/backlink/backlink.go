// Package scripts Backlink is a small script which is meant to insert backlinks into our notes
// You can run it manually on your knowledge base, or you can run it periodically
// Should be run with working directory set to your root knowledge base
// WARNING! Cases with "|" in urls aren't handled yet, so duplicate urls possible
// We don't support relative paths, missing folder means root
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/spf13/afero"
	"golang.org/x/exp/slices"
	"golang.org/x/text/unicode/norm"

	"github.com/zakirullin/files.md/server/fs"
)

func main() {
	dryRun := false
	for _, arg := range os.Args[1:] {
		if arg == "--dry-run" {
			dryRun = true
		}
	}

	// [dir][note] => links referring to our note (backlinks)
	backlinks := make(map[string]map[string][]string)

	userFS, err := fs.NewFS(".", afero.NewOsFs())
	if err != nil {
		fmt.Printf("Can't create FS: %s", err)
		return
	}

	files, err := userFS.FilesAndDirs("")
	if err != nil {
		fmt.Printf("Can't get files and dirs: %s", err)
		return
	}
	dirs := fs.OnlyNoteDirs(fs.OnlyDirs(files))

	// Run through files, if our file has link to some note, we add our current note's path to referred note's backlinks
	for _, dir := range dirs {
		notes, err := userFS.FilesAndDirs(dir.Name)
		if err != nil {
			fmt.Printf("Can't get notes: %s", err)
		}

		notes = fs.OnlyUserMDFiles(notes)
		for _, note := range notes {
			if filepath.Ext(note.Name) != fs.MDExt {
				continue
			}

			content, err := userFS.Read(dir.Name, note.Name)
			if err != nil {
				fmt.Printf("Can't get content: %s", err)
				continue
			}

			links := regexp.MustCompile(`\[\[(.+?)\]\]`)
			matches := links.FindAllStringSubmatch(content, -1)
			for _, match := range matches {
				if len(match) < 2 {
					continue
				}

				link := match[1]
				if strings.Contains(link, "img/") {
					continue
				}
				// There are issues with "й" letter. Probably it has non-canonical encoding in mac FS
				link = string(norm.NFC.Bytes([]byte(link)))
				// We don't support labels
				link = strings.Split(link, "|")[0]

				// dir/note
				parts := strings.Split(link, "/")

				isInRootDir := len(parts) == 1
				if isInRootDir {
					// TODO implement support for root files
					continue
				}

				refToDir := parts[0]
				refToNote := parts[1]

				filename := note.Name
				filename = string(norm.NFC.Bytes([]byte(filename)))
				filename = strings.TrimSuffix(filename, fs.MDExt)
				link = fmt.Sprintf("%s/%s", dir.Name, filename)

				if _, ok := backlinks[refToDir]; !ok {
					backlinks[refToDir] = make(map[string][]string)
				}
				backlinks[refToDir][refToNote] = append(backlinks[refToDir][refToNote], link)
			}
		}
	}

	for dir, notes := range backlinks {
		for note, links := range notes {
			for _, link := range links {
				content, err := userFS.Read(dir, note+fs.MDExt)
				if err != nil {
					fmt.Printf("Can't get target note '%s/%s.md':%s, backlinks: %v", dir, note, err, links)
					continue
				}

				var existingLinks []string
				existingLinksRx := regexp.MustCompile(`\[\[(.*)\]\]`)
				matches := existingLinksRx.FindAllStringSubmatch(content, -1)
				for _, match := range matches {
					if len(match) < 2 {
						continue
					}
					existingLink := strings.Split(match[1], "|")[0]
					existingLinks = append(existingLinks, existingLink)
				}

				if slices.Contains(existingLinks, link) {
					continue
				}

				if dryRun {
					fmt.Printf("would add '%s' to '%s/%s'\n", link, dir, note)
					continue
				}

				err = userFS.Write(dir, note+".md", fmt.Sprintf("%s\n[[%s]]", strings.TrimSpace(content), link))
				if err != nil {
					fmt.Printf("Can't put to file: %s", err)
					return
				}

				fmt.Printf("ADD '%s' TO '%s/%s'\n", link, dir, note)
			}
		}
	}
}
