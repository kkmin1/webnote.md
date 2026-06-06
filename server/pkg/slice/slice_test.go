package slice

import (
	"reflect"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSmallerChunk(t *testing.T) {
	// Test case 1: Chunk size is smaller than the length of the items slice
	items := []int{1, 2, 3, 4, 5, 6}
	chunkSize := 2
	expectedChunks := [][]int{
		{1, 2},
		{3, 4},
		{5, 6},
	}
	chunks := Chunk(items, chunkSize)
	if !reflect.DeepEqual(chunks, expectedChunks) {
		t.Errorf("Test case 1 failed. Expected chunks: %v, got: %v", expectedChunks, chunks)
	}
}

func TestLargerChunk(t *testing.T) {
	r := require.New(t)
	r.Equal([][]int{{1, 2, 3, 4, 5, 6}}, Chunk([]int{1, 2, 3, 4, 5, 6}, 10))
}

func TestEqualChunk(t *testing.T) {
	r := require.New(t)

	items := []int{1, 2, 3, 4, 5, 6}
	chunkSize := len(items)
	chunks := Chunk(items, chunkSize)
	r.Equal([][]int{{1, 2, 3, 4, 5, 6}}, chunks)
}

func TestChunkEmpty(t *testing.T) {
	r := require.New(t)
	r.Equal([][]int{}, Chunk([]int{}, 2))
}
