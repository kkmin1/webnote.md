// Parses Whoop CSV exports and prints a 10-day journal summary.
//
// Usage: go run ./cmd/scripts/whoop <path-to-whoop-export-dir>
// Example: go run ./cmd/scripts/whoop ./whoop
package main

import (
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

type day struct {
	Date     time.Time
	Sleep    sleepData
	Recovery recoveryData
	Workouts []workout
}

type sleepData struct {
	Performance int
	AsleepMin   int
	Present     bool
}

type recoveryData struct {
	Score   int
	HRV     int
	RHR     int
	Strain  float64
	Present bool
}

type workout struct {
	Activity    string
	DurationMin int
}

func main() {
	dir := "."
	if len(os.Args) > 1 {
		dir = os.Args[1]
	}

	days := map[string]*day{}
	dayOf := func(t time.Time) *day {
		key := t.Format("2006-01-02")
		if d, ok := days[key]; ok {
			return d
		}
		d := &day{Date: t}
		days[key] = d
		return d
	}

	// Parse sleeps - use wake onset date as the day, skip naps.
	parseSleeps(filepath.Join(dir, "sleeps.csv"), dayOf)

	// Parse physiological cycles - recovery, HRV, RHR, strain.
	parseCycles(filepath.Join(dir, "physiological_cycles.csv"), dayOf)

	// Parse workouts.
	parseWorkouts(filepath.Join(dir, "workouts.csv"), dayOf)

	// Collect and sort days descending.
	var sorted []*day
	for _, d := range days {
		sorted = append(sorted, d)
	}
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Date.After(sorted[j].Date)
	})

	// Print last 10 days.
	n := 10
	if len(sorted) < n {
		n = len(sorted)
	}
	for _, d := range sorted[:n] {
		printDay(d)
		fmt.Println()
	}
}

func parseSleeps(path string, dayOf func(time.Time) *day) {
	rows := readCSV(path)
	if len(rows) < 2 {
		return
	}
	header := indexHeader(rows[0])

	for _, row := range rows[1:] {
		if field(row, header, "Nap") == "true" {
			continue
		}

		wake, err := parseTime(field(row, header, "Wake onset"))
		if err != nil {
			continue
		}

		d := dayOf(wake)
		d.Sleep.Present = true
		d.Sleep.Performance = atoi(field(row, header, "Sleep performance %"))
		d.Sleep.AsleepMin = atoi(field(row, header, "Asleep duration (min)"))
	}
}

func parseCycles(path string, dayOf func(time.Time) *day) {
	rows := readCSV(path)
	if len(rows) < 2 {
		return
	}
	header := indexHeader(rows[0])

	for _, row := range rows[1:] {
		wake, err := parseTime(field(row, header, "Wake onset"))
		if err != nil {
			continue
		}

		d := dayOf(wake)
		d.Recovery.Present = true
		d.Recovery.Score = atoi(field(row, header, "Recovery score %"))
		d.Recovery.HRV = atoi(field(row, header, "Heart rate variability (ms)"))
		d.Recovery.RHR = atoi(field(row, header, "Resting heart rate (bpm)"))
		d.Recovery.Strain = atof(field(row, header, "Day Strain"))
	}
}

func parseWorkouts(path string, dayOf func(time.Time) *day) {
	rows := readCSV(path)
	if len(rows) < 2 {
		return
	}
	header := indexHeader(rows[0])

	for _, row := range rows[1:] {
		start, err := parseTime(field(row, header, "Workout start time"))
		if err != nil {
			continue
		}

		d := dayOf(start)
		d.Workouts = append(d.Workouts, workout{
			Activity:    field(row, header, "Activity name"),
			DurationMin: atoi(field(row, header, "Duration (min)")),
		})
	}
}

func printDay(d *day) {
	fmt.Printf("#### %d %s, %s\n", d.Date.Day(), d.Date.Format("January"), d.Date.Weekday())

	if d.Sleep.Present {
		h := d.Sleep.AsleepMin / 60
		m := d.Sleep.AsleepMin % 60
		fmt.Printf("- Sleep: %d%%, %dh %02dm\n", d.Sleep.Performance, h, m)
	}

	if d.Recovery.Present {
		fmt.Printf("- Recovery: %d%%, HRV %d, RHR %d\n", d.Recovery.Score, d.Recovery.HRV, d.Recovery.RHR)
		if d.Recovery.Strain > 0 {
			fmt.Printf("- Strain: %.1f\n", d.Recovery.Strain)
		}
	}

	for _, w := range d.Workouts {
		fmt.Printf("- Workout: %s %dm\n", w.Activity, w.DurationMin)
	}
}

// CSV helpers

func readCSV(path string) [][]string {
	f, err := os.Open(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: %s\n", err)
		return nil
	}
	defer f.Close()

	r := csv.NewReader(f)
	rows, err := r.ReadAll()
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: can't parse %s: %s\n", path, err)
		return nil
	}
	return rows
}

func indexHeader(row []string) map[string]int {
	m := make(map[string]int, len(row))
	for i, col := range row {
		m[strings.TrimSpace(col)] = i
	}
	return m
}

func field(row []string, header map[string]int, name string) string {
	i, ok := header[name]
	if !ok || i >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[i])
}

func parseTime(s string) (time.Time, error) {
	return time.Parse("2006-01-02 15:04:05", s)
}

func atoi(s string) int {
	// Handle float strings like "421.0"
	if strings.Contains(s, ".") {
		f, _ := strconv.ParseFloat(s, 64)
		return int(f)
	}
	v, _ := strconv.Atoi(s)
	return v
}

func atof(s string) float64 {
	v, _ := strconv.ParseFloat(s, 64)
	return v
}
