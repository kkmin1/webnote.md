package slice

// Chunk splits items into chunkSize-d chunks
// Chunk([1,2,3], 2) => [[1,2], [3]
func Chunk[T any](items []T, chunkSize int) [][]T {
	if len(items) == 0 {
		return [][]T{}
	}

	var chunks [][]T
	for len(items) > chunkSize {
		items, chunks = items[chunkSize:], append(chunks, items[0:chunkSize:chunkSize])
	}

	return append(chunks, items)
}
