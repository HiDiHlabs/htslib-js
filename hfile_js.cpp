#include <emscripten.h>
#include <stdlib.h>

#include "hfile_js.h"

#include <iostream>
using namespace std;

static ssize_t js_read(hFILE *fp, void *buffer, size_t nbytes)
{
    ssize_t size = EM_ASM_INT({
        return js_read($0, $1, $2);
    }, ((hFILE_js *)fp)->fd, (int)buffer, nbytes);
    return size;
}

static off_t js_seek(hFILE *fp, off_t offset, int whence)
{
    off_t off = EM_ASM_INT({
        var new_offset = js_seek($0, $1, $2);
    }, ((hFILE_js *)fp)->fd, offset, whence);
    return off;
}

static int js_close(hFILE *fp)
{
    if (fp == 0) return 0;
    int rtn = EM_ASM_INT({
        js_close($0);
    }, ((hFILE_js *)fp)->fd);
    free(fp);
    return 0;
}

static const struct hFILE_backend js_backend =
{
    js_read, NULL, js_seek, NULL, js_close
};

hFILE *hopen_js(int fd) {
    hFILE_js *fp = (hFILE_js *) hfile_init(sizeof (hFILE_js), "r", 32768);
    fp->base.backend = &js_backend;
    fp->fd = fd;
    return &fp->base;
}
