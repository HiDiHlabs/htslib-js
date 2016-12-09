#include <stdio.h>
#include <stdlib.h>

int main() {
    unsigned char *a = (unsigned char *)malloc(10);

    a[0] = 0;
    a[1] = 245;
    a[2] = 4;
    a[3] = 0;
    a[4] = 0;
    a[5] = 0;
    a[6] = 0;
    a[7] = 0;
    a[8] = 0;

    unsigned int *b = (unsigned int *)(a+1);
    printf("C cast: %d\n", b[0]);

    free((void *)a);
    return 0;
}
