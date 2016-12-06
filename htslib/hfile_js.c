/*  hfile_js.c -- javascript backend for low-level input/output streams.

Author: Jeongbin Park <j.park@dkfz.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.  */

#include <config.h>

#include <stdlib.h>
#include <errno.h>

#include "hfile_internal.h"

typedef struct kjsFile_s {
    int type, fd;
    int64_t offset;
    int64_t file-size;
    char *path;
} kjsFile;

typedef struct {
    hFILE base;
    kjsFile *jsfp;
} hFILE_js;

static int js_inited = 0;

static int js_init(void)
{
    js_inited = 1;
    return 0;
}

static ssize_t js_read(hFILE *fpv, void *buffer, size_t nbytes)
{
    hFILE_js *fp = (hFILE_js *) fpv;
    return kjs_read(fp->jsfp, buffer, nbytes);
}

static off_t js_seek(hFILE *fpv, off_t offset, int whence)
{
    hFILE_js *fp = (hFILE_js *) fpv;
    return kjs_seek(fp->jsfp, offset, whence);
}

static int js_close(hFILE *fpv)
{
    hFILE_js *fp = (hFILE_js *) fpv;
    return kjs_close(fp->jsfp);
}

static const struct hFILE_backend js_backend =
{
    js_read, NULL, js_seek, NULL, js_close
};

hFILE *hopen_js(const char *filename, const char *mode)
{
    hFILE_js *fp;

    if (! js_inited) { if (js_init() < 0) return NULL; }

    fp = (hFILE_js *) hfile_init(sizeof (hFILE_js), mode, 0);
    if (fp == NULL) return NULL;

    fp->jsfp = kjs_open(filename, mode);
    if (fp->jsfp == NULL) { hfile_destroy((hFILE *) fp); return NULL; }

    fp->base.backend = &js_backend;
    return &fp->base;
}

int hfile_plugin_init_js(struct hFILE_plugin *self)
{
    static const struct hFILE_scheme_handler handler =
        { hopen_js, hfile_always_remote, "kjsfile", 0 };

    self->name = "kjsfile";
    hfile_add_scheme_handler("browser", &handler);
    hfile_add_scheme_handler("node",  &handler);
    return 0;
}
