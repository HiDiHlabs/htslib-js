// A simple resizable integer array

#ifndef HTSLIB_JS_ARRAY_H
#define HTSLIB_JS_ARRAY_H

#include <errno.h>
#include <stdlib.h>

#define ARRAY_INITIAL_CAPACITY 128

typedef struct array {
    int size;
    int capacity;
    int *data;
} array_t;

array_t *array_new();

void array_init(array_t *array);

void array_append(array_t *array, int value);

int array_get(array_t *array, int index);

void array_set(array_t *array, int index, int value);

void array_double_capacity_if_full(array_t *array);

void array_free(array_t *array);

#endif //HTSLIB_JS_ARRAY_H
