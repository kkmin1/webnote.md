package main

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// adjustTime adjusts the time in a given line by the specified number of hours
func adjustTime(line string, hours int) string {
	// Regex to match time in format HH:MM
	re := regexp.MustCompile("^`\\d{2}:\\d{2}`")
	match := re.FindString(line)
	match = strings.Trim(match, "`")
	if match != "" {
		// Parse the time
		t, err := time.Parse("15:04", match)
		if err != nil {
			fmt.Println("Error parsing time:", err)
			return line
		}
		// Adjust the time by the specified number of hours
		t = t.Add(time.Duration(hours) * time.Hour)
		// Replace the time in the line with the new time
		return strings.Replace(line, match, t.Format("15:04"), 1)
	}
	return line
}

func main() {
	if len(os.Args) < 3 {
		fmt.Println("Usage: go run main.go <file.md> <hours>")
		return
	}

	// Get the file name and hours from command line arguments
	fileName := os.Args[1]
	hours, err := strconv.Atoi(os.Args[2])
	if err != nil {
		fmt.Println("Invalid number of hours:", err)
		return
	}

	// Open the file
	file, err := os.Open(fileName)
	if err != nil {
		fmt.Println("Error opening file:", err)
		return
	}
	defer file.Close()

	// Create a scanner to read the file line by line
	scanner := bufio.NewScanner(file)
	var lines []string

	// Process each line
	for scanner.Scan() {
		line := scanner.Text()
		adjustedLine := adjustTime(line, hours)
		lines = append(lines, adjustedLine)
	}

	if err := scanner.Err(); err != nil {
		fmt.Println("Error reading file:", err)
		return
	}

	// Write the adjusted lines back to the file
	outputFile, err := os.Create(fileName)
	if err != nil {
		fmt.Println("Error creating output file:", err)
		return
	}
	defer outputFile.Close()

	writer := bufio.NewWriter(outputFile)
	for _, line := range lines {
		_, err := writer.WriteString(line + "\n")
		if err != nil {
			fmt.Println("Error writing to file:", err)
			return
		}
	}
	writer.Flush()

	fmt.Println("Time adjustment completed successfully.")
}
