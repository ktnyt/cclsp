// Go test fixture for rename operations
package main

import (
	"fmt"
	"sync"
)

// DataStore represents a thread-safe data storage
type DataStore struct {
	mu    sync.RWMutex
	items map[string]interface{}
}

// NewDataStore creates a new DataStore instance
func NewDataStore() *DataStore {
	return &DataStore{
		items: make(map[string]interface{}),
	}
}

// Set stores a value with the given key
func (ds *DataStore) Set(key string, value interface{}) {
	ds.mu.Lock()
	defer ds.mu.Unlock()
	ds.items[key] = value
}

// Get retrieves a value by key
func (ds *DataStore) Get(key string) (interface{}, bool) {
	ds.mu.RLock()
	defer ds.mu.RUnlock()
	val, ok := ds.items[key]
	return val, ok
}

// Delete removes a key from the store
func (ds *DataStore) Delete(key string) {
	ds.mu.Lock()
	defer ds.mu.Unlock()
	delete(ds.items, key)
}

// Size returns the number of items in the store
func (ds *DataStore) Size() int {
	ds.mu.RLock()
	defer ds.mu.RUnlock()
	return len(ds.items)
}

func main() {
	store := NewDataStore()
	store.Set("name", "Alice")
	store.Set("age", 30)
	
	if val, ok := store.Get("name"); ok {
		fmt.Printf("Name: %v\n", val)
	}
	
	fmt.Printf("Store size: %d\n", store.Size())
}