var htsfiles = {};

function Htsfile(fileobj) {
    this.reader = new FileReaderSync();
    this.offset = 0;
    this.cursor = -1;
    this.bufsize = 4194304; // 4 MiB
    this.buf = undefined;
    this.eof = 0;
    this.fileobj = fileobj;
}

Htsfile.prototype._getchunk = function () {
    if (this.fileobj.size > this.offset+this.bufsize) {
        blob = this.fileobj.slice(this.offset, this.offset+this.bufsize);
    } else {
        blob = this.fileobj.slice(this.offset, this.fileobj.size);
        this.eof = 1;
    }
    this.offset += this.bufsize;
    this.buf = this.reader.readAsArrayBuffer(blob);
    this.cursor = 0;
}

Htsfile.prototype.seek = function (offset, whence) {
    var prev_offset = this.offset - this.bufsize;
    if (whence >= 0 && whence <= 2) {
        if (whence == 1)
            offset += prev_offset;
        if (whence == 2)
            offset = this.fileobj.size + offset;
        if (prev_offset <= offset && offset < this.offset) {
            this.cursor = offset - prev_offset;
        } else {
            this.offset = offset;
            this.cursor = -1;
        }
        return offset;
    }
    return -1;
}

Htsfile.prototype.read = function (ptr, nbytes) {
    var buf, heap, over, nbytesread;

    if (this.cursor === -1)
        this._getchunk();

    heap = new Int8Array(Module.HEAP8.buffer, ptr, nbytes);
    if (this.bufsize > this.cursor+nbytes) {
        buf = this.buf.slice(this.cursor, this.cursor+nbytes);
        heap.set(new Int8Array(buf));
        nbytesread = nbytes;

        this.cursor += nbytes;
    } else {
        if (this.eof) return 0;

        over = this.cursor + nbytes - this.bufsize + 1;

        buf = this.buf.slice(this.cursor, this.bufsize);
        heap.set(new Int8Array(buf));

        nbytesread = this.bufsize - this.cursor;

        this._getchunk();
        if (this.eof) {
            if (this.buf.byteLength > over) {
                buf = this.buf.slice(0, over);
                heap.set(new Int8Array(buf, nbytes-over));
                nbytesread += over;
            } else if (this.buf.byteLength > 0) {
                heap.set(new Int8Array(buf));
                nbytesread += buf.byteLength;
            }
        } else {
            buf = this.buf.slice(0, over);
            heap.set(new Int8Array(buf, nbytes-over));
            nbytesread += over;
        }

        this.cursor += over;
    }
    return nbytesread;
}

Htsfile.prototype.close = function () {
}

function js_close(fd) {
    htsfiles[fd].close();
    delete htsfiles[fd];
}

function js_seek(fd, offset, whence) {
    return htsfiles[fd].seek(offset, whence);
}

function js_read(fd, ptr, nbytes) {
    return htsfiles[fd].read(ptr, nbytes);
}

function hts_open(fileobj) {
    var f = new Htsfile(fileobj);
    for (var fd=1;;fd++) {
        if (htsfiles[fd] === undefined)
            break;
    }
    htsfiles[fd] = f;

    if (Module._bgzf_open_js(fd) == 0)
        return fd;
    else
        throw "Something wrong happened while opening file.";
        return 0;
}

function hts_close(fd) {
    Module._bgzf_close_js(fd);
}

function test(fd) {
    Module._test(fd);
}

