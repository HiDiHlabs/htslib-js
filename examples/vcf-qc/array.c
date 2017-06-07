#include "array.h"
#include <stdio.h>

array_t *array_new() {
    array_t *array = (array_t *) malloc(sizeof(array_t));
    array_init(array);
    return array;
}

void array_init(array_t *array) {
    array->size = 0;
    array->capacity = ARRAY_INITIAL_CAPACITY;
    array->data = (int *) malloc(sizeof(int) * ARRAY_INITIAL_CAPACITY);
}

void array_append(array_t *array, int value) {
    array_double_capacity_if_full(array);
    array->data[array->size++] = value;
}

int array_get(array_t *array, int index) {
    if (index >= array->size || index < 0) {
        printf("Index %d out of bounds for array of size %d\n", index, array->size);
        exit(1);
    }
    return array->data[index];
}

void array_set(array_t *array, int index, int value) {
    if (index >= array->size || index < 0) {
        printf("Index %d out of bounds for array of size %d\n", index, array->size);
        exit(1);
    }
    array->data[index] = value;
}

void array_double_capacity_if_full(array_t *array) {
    if (array->size >= array->capacity) {
        array->capacity *= 2;
        array->data = realloc(array->data, sizeof(int) * array->capacity);
    }
}

void array_free(array_t *array) {
    free(array->data);
}
