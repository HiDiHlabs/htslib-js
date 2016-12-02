// The Module object: Our interface to the outside world. We import
// and export values on it, and do the work to get that through
// closure compiler if necessary. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to do an eval in order to handle the closure compiler
// case, where this code here is minified but Module was defined
// elsewhere (e.g. case 4 above). We also need to check if Module
// already exists (e.g. case 3 above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module;
if (!Module) Module = (typeof Module !== 'undefined' ? Module : null) || {};

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
for (var key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('The provided Module[\'ENVIRONMENT\'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  if (!Module['print']) Module['print'] = console.log;
  if (!Module['printErr']) Module['printErr'] = console.warn;

  var nodeFS;
  var nodePath;

  Module['read'] = function read(filename, binary) {
    if (!nodeFS) nodeFS = require('fs');
    if (!nodePath) nodePath = require('path');

    filename = nodePath['normalize'](filename);
    var ret = nodeFS['readFileSync'](filename);
    // The path is absolute if the normalized version is the same as the resolved.
    if (!ret && filename != nodePath['resolve'](filename)) {
      filename = path.join(__dirname, '..', 'src', filename);
      ret = nodeFS['readFileSync'](filename);
    }
    if (ret && !binary) ret = ret.toString();
    return ret;
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  Module['load'] = function load(f) {
    globalEval(read(f));
  };

  if (!Module['thisProgram']) {
    if (process['argv'].length > 1) {
      Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    } else {
      Module['thisProgram'] = 'unknown-program';
    }
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (!Module['print']) Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr; // not present in v8 or older sm

  if (typeof read != 'undefined') {
    Module['read'] = read;
  } else {
    Module['read'] = function read() { throw 'no read() available (jsc?)' };
  }

  Module['readBinary'] = function readBinary(f) {
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    var data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function read(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    return xhr.responseText;
  };

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
      } else {
        onerror();
      }
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof console !== 'undefined') {
    if (!Module['print']) Module['print'] = function print(x) {
      console.log(x);
    };
    if (!Module['printErr']) Module['printErr'] = function printErr(x) {
      console.warn(x);
    };
  } else {
    // Probably a worker, and without console.log. We can do very little here...
    var TRY_USE_DUMP = false;
    if (!Module['print']) Module['print'] = (TRY_USE_DUMP && (typeof(dump) !== "undefined") ? (function(x) {
      dump(x);
    }) : (function(x) {
      // self.postMessage(x); // enable this if you want stdout to be sent as messages
    }));
  }

  if (ENVIRONMENT_IS_WORKER) {
    Module['load'] = importScripts;
  }

  if (typeof Module['setWindowTitle'] === 'undefined') {
    Module['setWindowTitle'] = function(title) { document.title = title };
  }
}
else {
  // Unreachable because SHELL is dependant on the others
  throw 'Unknown runtime environment. Where are we?';
}

function globalEval(x) {
  eval.call(null, x);
}
if (!Module['load'] && Module['read']) {
  Module['load'] = function load(f) {
    globalEval(Module['read'](f));
  };
}
if (!Module['print']) {
  Module['print'] = function(){};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
if (!Module['thisProgram']) {
  Module['thisProgram'] = './this.program';
}

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Callbacks
Module['preRun'] = [];
Module['postRun'] = [];

// Merge back in the overrides
for (var key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in: 
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at: 
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

//========================================
// Runtime code shared with compiler
//========================================

var Runtime = {
  setTempRet0: function (value) {
    tempRet0 = value;
  },
  getTempRet0: function () {
    return tempRet0;
  },
  stackSave: function () {
    return STACKTOP;
  },
  stackRestore: function (stackTop) {
    STACKTOP = stackTop;
  },
  getNativeTypeSize: function (type) {
    switch (type) {
      case 'i1': case 'i8': return 1;
      case 'i16': return 2;
      case 'i32': return 4;
      case 'i64': return 8;
      case 'float': return 4;
      case 'double': return 8;
      default: {
        if (type[type.length-1] === '*') {
          return Runtime.QUANTUM_SIZE; // A pointer
        } else if (type[0] === 'i') {
          var bits = parseInt(type.substr(1));
          assert(bits % 8 === 0);
          return bits/8;
        } else {
          return 0;
        }
      }
    }
  },
  getNativeFieldSize: function (type) {
    return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
  },
  STACK_ALIGN: 16,
  prepVararg: function (ptr, type) {
    if (type === 'double' || type === 'i64') {
      // move so the load is aligned
      if (ptr & 7) {
        assert((ptr & 7) === 4);
        ptr += 4;
      }
    } else {
      assert((ptr & 3) === 0);
    }
    return ptr;
  },
  getAlignSize: function (type, size, vararg) {
    // we align i64s and doubles on 64-bit boundaries, unlike x86
    if (!vararg && (type == 'i64' || type == 'double')) return 8;
    if (!type) return Math.min(size, 8); // align structures internally to 64 bits
    return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
  },
  dynCall: function (sig, ptr, args) {
    if (args && args.length) {
      assert(args.length == sig.length-1);
      if (!args.splice) args = Array.prototype.slice.call(args);
      args.splice(0, 0, ptr);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].apply(null, args);
    } else {
      assert(sig.length == 1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].call(null, ptr);
    }
  },
  functionPointers: [],
  addFunction: function (func) {
    for (var i = 0; i < Runtime.functionPointers.length; i++) {
      if (!Runtime.functionPointers[i]) {
        Runtime.functionPointers[i] = func;
        return 2*(1 + i);
      }
    }
    throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
  },
  removeFunction: function (index) {
    Runtime.functionPointers[(index-2)/2] = null;
  },
  warnOnce: function (text) {
    if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
    if (!Runtime.warnOnce.shown[text]) {
      Runtime.warnOnce.shown[text] = 1;
      Module.printErr(text);
    }
  },
  funcWrappers: {},
  getFuncWrapper: function (func, sig) {
    assert(sig);
    if (!Runtime.funcWrappers[sig]) {
      Runtime.funcWrappers[sig] = {};
    }
    var sigCache = Runtime.funcWrappers[sig];
    if (!sigCache[func]) {
      sigCache[func] = function dynCall_wrapper() {
        return Runtime.dynCall(sig, func, arguments);
      };
    }
    return sigCache[func];
  },
  getCompilerSetting: function (name) {
    throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
  },
  stackAlloc: function (size) { var ret = STACKTOP;STACKTOP = (STACKTOP + size)|0;STACKTOP = (((STACKTOP)+15)&-16);(assert((((STACKTOP|0) < (STACK_MAX|0))|0))|0); return ret; },
  staticAlloc: function (size) { var ret = STATICTOP;STATICTOP = (STATICTOP + (assert(!staticSealed),size))|0;STATICTOP = (((STATICTOP)+15)&-16); return ret; },
  dynamicAlloc: function (size) { var ret = DYNAMICTOP;DYNAMICTOP = (DYNAMICTOP + (assert(DYNAMICTOP > 0),size))|0;DYNAMICTOP = (((DYNAMICTOP)+15)&-16); if (DYNAMICTOP >= TOTAL_MEMORY) { var success = enlargeMemory(); if (!success) { DYNAMICTOP = ret;  return 0; } }; return ret; },
  alignMemory: function (size,quantum) { var ret = size = Math.ceil((size)/(quantum ? quantum : 16))*(quantum ? quantum : 16); return ret; },
  makeBigInt: function (low,high,unsigned) { var ret = (unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0))); return ret; },
  GLOBAL_BASE: 8,
  QUANTUM_SIZE: 4,
  __dummy__: 0
}







//========================================
// Runtime essentials
//========================================

var ABORT = false; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  if (!func) {
    try { func = eval('_' + ident); } catch(e) {}
  }
  assert(func, 'Cannot call unknown function ' + ident + ' (perhaps LLVM optimizations or closure removed it?)');
  return func;
}

var cwrap, ccall;
(function(){
  var JSfuncs = {
    // Helpers for cwrap -- it can't refer to Runtime directly because it might
    // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
    // out what the minified function name is.
    'stackSave': function() {
      Runtime.stackSave()
    },
    'stackRestore': function() {
      Runtime.stackRestore()
    },
    // type conversion from js to c
    'arrayToC' : function(arr) {
      var ret = Runtime.stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    },
    'stringToC' : function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        ret = Runtime.stackAlloc((str.length << 2) + 1);
        writeStringToMemory(str, ret);
      }
      return ret;
    }
  };
  // For fast lookup of conversion functions
  var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

  // C calling interface. 
  ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    assert(returnType !== 'array', 'Return type should not be "array".');
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = Runtime.stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func.apply(null, cArgs);
    if ((!opts || !opts.async) && typeof EmterpreterAsync === 'object') {
      assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling ccall');
    }
    if (opts && opts.async) assert(!returnType, 'async ccalls cannot return values');
    if (returnType === 'string') ret = Pointer_stringify(ret);
    if (stack !== 0) {
      if (opts && opts.async) {
        EmterpreterAsync.asyncFinalizers.push(function() {
          Runtime.stackRestore(stack);
        });
        return;
      }
      Runtime.stackRestore(stack);
    }
    return ret;
  }

  var sourceRegex = /^function\s*[a-zA-Z$_0-9]*\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
  function parseJSFunc(jsfunc) {
    // Match the body and the return value of a javascript function source
    var parsed = jsfunc.toString().match(sourceRegex).slice(1);
    return {arguments : parsed[0], body : parsed[1], returnValue: parsed[2]}
  }

  // sources of useful functions. we create this lazily as it can trigger a source decompression on this entire file
  var JSsource = null;
  function ensureJSsource() {
    if (!JSsource) {
      JSsource = {};
      for (var fun in JSfuncs) {
        if (JSfuncs.hasOwnProperty(fun)) {
          // Elements of toCsource are arrays of three items:
          // the code, and the return value
          JSsource[fun] = parseJSFunc(JSfuncs[fun]);
        }
      }
    }
  }
  
  cwrap = function cwrap(ident, returnType, argTypes) {
    argTypes = argTypes || [];
    var cfunc = getCFunc(ident);
    // When the function takes numbers and returns a number, we can just return
    // the original function
    var numericArgs = argTypes.every(function(type){ return type === 'number'});
    var numericRet = (returnType !== 'string');
    if ( numericRet && numericArgs) {
      return cfunc;
    }
    // Creation of the arguments list (["$1","$2",...,"$nargs"])
    var argNames = argTypes.map(function(x,i){return '$'+i});
    var funcstr = "(function(" + argNames.join(',') + ") {";
    var nargs = argTypes.length;
    if (!numericArgs) {
      // Generate the code needed to convert the arguments from javascript
      // values to pointers
      ensureJSsource();
      funcstr += 'var stack = ' + JSsource['stackSave'].body + ';';
      for (var i = 0; i < nargs; i++) {
        var arg = argNames[i], type = argTypes[i];
        if (type === 'number') continue;
        var convertCode = JSsource[type + 'ToC']; // [code, return]
        funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
        funcstr += convertCode.body + ';';
        funcstr += arg + '=(' + convertCode.returnValue + ');';
      }
    }

    // When the code is compressed, the name of cfunc is not literally 'cfunc' anymore
    var cfuncname = parseJSFunc(function(){return cfunc}).returnValue;
    // Call the function
    funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
    if (!numericRet) { // Return type can only by 'string' or 'number'
      // Convert the result to a string
      var strgfy = parseJSFunc(function(){return Pointer_stringify}).returnValue;
      funcstr += 'ret = ' + strgfy + '(ret);';
    }
    funcstr += "if (typeof EmterpreterAsync === 'object') { assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling cwrap') }";
    if (!numericArgs) {
      // If we had a stack, restore it
      ensureJSsource();
      funcstr += JSsource['stackRestore'].body.replace('()', '(stack)') + ';';
    }
    funcstr += 'return ret})';
    return eval(funcstr);
  };
})();



function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}



function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for setValue: ' + type);
    }
  return null;
}


var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate






// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : Runtime.staticAlloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var ptr = ret, stop;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(slab, ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = Runtime.getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}


// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return Runtime.staticAlloc(size);
  if ((typeof _sbrk !== 'undefined' && !_sbrk.called) || !runtimeInitialized) return Runtime.dynamicAlloc(size);
  return _malloc(size);
}


function Pointer_stringify(ptr, /* optional */ length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return Module['UTF8ToString'](ptr);
}


// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}


// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

function UTF8ArrayToString(u8Array, idx) {
  var u0, u1, u2, u3, u4, u5;

  var str = '';
  while (1) {
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    u0 = u8Array[idx++];
    if (!u0) return str;
    if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
    u1 = u8Array[idx++] & 63;
    if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
    u2 = u8Array[idx++] & 63;
    if ((u0 & 0xF0) == 0xE0) {
      u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
    } else {
      u3 = u8Array[idx++] & 63;
      if ((u0 & 0xF8) == 0xF0) {
        u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
      } else {
        u4 = u8Array[idx++] & 63;
        if ((u0 & 0xFC) == 0xF8) {
          u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
        } else {
          u5 = u8Array[idx++] & 63;
          u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
        }
      }
    }
    if (u0 < 0x10000) {
      str += String.fromCharCode(u0);
    } else {
      var ch = u0 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    }
  }
}


// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}


// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null 
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}


// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF16ToString(ptr) {
  var i = 0;

  var str = '';
  while (1) {
    var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
    if (codeUnit == 0)
      return str;
    ++i;
    // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
    str += String.fromCharCode(codeUnit);
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null 
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}


function UTF32ToString(ptr) {
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null 
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}


function demangle(func) {
  var hasLibcxxabi = !!Module['___cxa_demangle'];
  if (hasLibcxxabi) {
    try {
      var buf = _malloc(func.length);
      writeStringToMemory(func.substr(1), buf);
      var status = _malloc(4);
      var ret = Module['___cxa_demangle'](buf, 0, 0, status);
      if (getValue(status, 'i32') === 0 && ret) {
        return Pointer_stringify(ret);
      }
      // otherwise, libcxxabi failed, we can try ours which may return a partial result
    } catch(e) {
      // failure when using libcxxabi, we can try ours which may return a partial result
      return func;
    } finally {
      if (buf) _free(buf);
      if (status) _free(status);
      if (ret) _free(ret);
    }
  }
  Runtime.warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  return text.replace(/__Z[\w\d_]+/g, function(x) { var y = demangle(x); return x === y ? x : (x + ' [' + y + ']') });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  return demangleAll(jsStackTrace());
}


// Memory management

var PAGE_SIZE = 4096;

function alignMemoryPage(x) {
  if (x % 4096 > 0) {
    x += (4096 - (x % 4096));
  }
  return x;
}

var HEAP;
var buffer;
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE = 0, STATICTOP = 0, staticSealed = false; // static area
var STACK_BASE = 0, STACKTOP = 0, STACK_MAX = 0; // stack area
var DYNAMIC_BASE = 0, DYNAMICTOP = 0; // dynamic area handled by sbrk


function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which adjusts the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}

function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;

var totalMemory = 64*1024;
while (totalMemory < TOTAL_MEMORY || totalMemory < 2*TOTAL_STACK) {
  if (totalMemory < 16*1024*1024) {
    totalMemory *= 2;
  } else {
    totalMemory += 16*1024*1024
  }
}
if (totalMemory !== TOTAL_MEMORY) {
  Module.printErr('increasing TOTAL_MEMORY to ' + totalMemory + ' to be compliant with the asm.js spec (and given that TOTAL_STACK=' + TOTAL_STACK + ')');
  TOTAL_MEMORY = totalMemory;
}

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && !!(new Int32Array(1)['subarray']) && !!(new Int32Array(1)['set']),
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  buffer = new ArrayBuffer(TOTAL_MEMORY);
}
updateGlobalBufferViews();


// Endianness check (note: assumes compiler arch was little-endian)
HEAP32[0] = 255;
if (HEAPU8[0] !== 255 || HEAPU8[3] !== 0) throw 'Typed arrays 2 must be run on a little-endian system';

Module['HEAP'] = HEAP;
Module['buffer'] = buffer;
Module['HEAP8'] = HEAP8;
Module['HEAP16'] = HEAP16;
Module['HEAP32'] = HEAP32;
Module['HEAPU8'] = HEAPU8;
Module['HEAPU16'] = HEAPU16;
Module['HEAPU32'] = HEAPU32;
Module['HEAPF32'] = HEAPF32;
Module['HEAPF64'] = HEAPF64;

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Runtime.dynCall('v', func);
      } else {
        Runtime.dynCall('vi', func, [callback.arg]);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}


function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}


function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}


function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}


function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}


// Tools


function intArrayFromString(stringy, dontAddNull, length /* optional */) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}


function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}


function writeStringToMemory(string, buffer, dontAddNull) {
  var array = intArrayFromString(string, dontAddNull);
  var i = 0;
  while (i < array.length) {
    var chr = array[i];
    HEAP8[(((buffer)+(i))>>0)]=chr;
    i = i + 1;
  }
}


function writeArrayToMemory(array, buffer) {
  for (var i = 0; i < array.length; i++) {
    HEAP8[((buffer++)>>0)]=array[i];
  }
}


function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}


function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}


// check for imul support, and also for correctness ( https://bugs.webkit.org/show_bug.cgi?id=126345 )
if (!Math['imul'] || Math['imul'](0xffffffff, 5) !== -5) Math['imul'] = function imul(a, b) {
  var ah  = a >>> 16;
  var al = a & 0xffff;
  var bh  = b >>> 16;
  var bl = b & 0xffff;
  return (al*bl + ((ah*bl + al*bh) << 16))|0;
};
Math.imul = Math['imul'];


if (!Math['clz32']) Math['clz32'] = function(x) {
  x = x >>> 0;
  for (var i = 0; i < 32; i++) {
    if (x & (1 << (31 - i))) return i;
  }
  return 32;
};
Math.clz32 = Math['clz32']

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_min = Math.min;
var Math_clz32 = Math.clz32;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}


function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}


Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;

// === Body ===

var ASM_CONSTS = [function($0) { { return allocate(intArrayFromString(htsfiles[$0].fileobj.name), 'i8', ALLOC_NORMAL); } },
 function($0, $1, $2) { { return js_read($0, $1, $2); } },
 function($0, $1, $2) { { return js_seek($0, $1, $2); } },
 function($0) { { js_close($0); } }];

function _emscripten_asm_const_iiii(code, a0, a1, a2) {
 return ASM_CONSTS[code](a0, a1, a2);
}

function _emscripten_asm_const_ii(code, a0) {
 return ASM_CONSTS[code](a0);
}



STATIC_BASE = 8;

STATICTOP = STATIC_BASE + 18944;
  /* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_bam_cpp() } });
  

/* memory initializer */ allocate([188,36,0,0,27,67,0,0,228,36,0,0,249,66,0,0,48,0,0,0,0,0,0,0,228,36,0,0,166,66,0,0,16,0,0,0,0,0,0,0,228,36,0,0,203,66,0,0,64,0,0,0,0,0,0,0,188,36,0,0,236,66,0,0,228,36,0,0,40,67,0,0,8,0,0,0,0,0,0,0,228,36,0,0,104,67,0,0,48,0,0,0,0,0,0,0,228,36,0,0,68,67,0,0,88,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,3,0,0,0,0,0,0,0,150,48,7,119,44,97,14,238,186,81,9,153,25,196,109,7,143,244,106,112,53,165,99,233,163,149,100,158,50,136,219,14,164,184,220,121,30,233,213,224,136,217,210,151,43,76,182,9,189,124,177,126,7,45,184,231,145,29,191,144,100,16,183,29,242,32,176,106,72,113,185,243,222,65,190,132,125,212,218,26,235,228,221,109,81,181,212,244,199,133,211,131,86,152,108,19,192,168,107,100,122,249,98,253,236,201,101,138,79,92,1,20,217,108,6,99,99,61,15,250,245,13,8,141,200,32,110,59,94,16,105,76,228,65,96,213,114,113,103,162,209,228,3,60,71,212,4,75,253,133,13,210,107,181,10,165,250,168,181,53,108,152,178,66,214,201,187,219,64,249,188,172,227,108,216,50,117,92,223,69,207,13,214,220,89,61,209,171,172,48,217,38,58,0,222,81,128,81,215,200,22,97,208,191,181,244,180,33,35,196,179,86,153,149,186,207,15,165,189,184,158,184,2,40,8,136,5,95,178,217,12,198,36,233,11,177,135,124,111,47,17,76,104,88,171,29,97,193,61,45,102,182,144,65,220,118,6,113,219,1,188,32,210,152,42,16,213,239,137,133,177,113,31,181,182,6,165,228,191,159,51,212,184,232,162,201,7,120,52,249,0,15,142,168,9,150,24,152,14,225,187,13,106,127,45,61,109,8,151,108,100,145,1,92,99,230,244,81,107,107,98,97,108,28,216,48,101,133,78,0,98,242,237,149,6,108,123,165,1,27,193,244,8,130,87,196,15,245,198,217,176,101,80,233,183,18,234,184,190,139,124,136,185,252,223,29,221,98,73,45,218,21,243,124,211,140,101,76,212,251,88,97,178,77,206,81,181,58,116,0,188,163,226,48,187,212,65,165,223,74,215,149,216,61,109,196,209,164,251,244,214,211,106,233,105,67,252,217,110,52,70,136,103,173,208,184,96,218,115,45,4,68,229,29,3,51,95,76,10,170,201,124,13,221,60,113,5,80,170,65,2,39,16,16,11,190,134,32,12,201,37,181,104,87,179,133,111,32,9,212,102,185,159,228,97,206,14,249,222,94,152,201,217,41,34,152,208,176,180,168,215,199,23,61,179,89,129,13,180,46,59,92,189,183,173,108,186,192,32,131,184,237,182,179,191,154,12,226,182,3,154,210,177,116,57,71,213,234,175,119,210,157,21,38,219,4,131,22,220,115,18,11,99,227,132,59,100,148,62,106,109,13,168,90,106,122,11,207,14,228,157,255,9,147,39,174,0,10,177,158,7,125,68,147,15,240,210,163,8,135,104,242,1,30,254,194,6,105,93,87,98,247,203,103,101,128,113,54,108,25,231,6,107,110,118,27,212,254,224,43,211,137,90,122,218,16,204,74,221,103,111,223,185,249,249,239,190,142,67,190,183,23,213,142,176,96,232,163,214,214,126,147,209,161,196,194,216,56,82,242,223,79,241,103,187,209,103,87,188,166,221,6,181,63,75,54,178,72,218,43,13,216,76,27,10,175,246,74,3,54,96,122,4,65,195,239,96,223,85,223,103,168,239,142,110,49,121,190,105,70,140,179,97,203,26,131,102,188,160,210,111,37,54,226,104,82,149,119,12,204,3,71,11,187,185,22,2,34,47,38,5,85,190,59,186,197,40,11,189,178,146,90,180,43,4,106,179,92,167,255,215,194,49,207,208,181,139,158,217,44,29,174,222,91,176,194,100,155,38,242,99,236,156,163,106,117,10,147,109,2,169,6,9,156,63,54,14,235,133,103,7,114,19,87,0,5,130,74,191,149,20,122,184,226,174,43,177,123,56,27,182,12,155,142,210,146,13,190,213,229,183,239,220,124,33,223,219,11,212,210,211,134,66,226,212,241,248,179,221,104,110,131,218,31,205,22,190,129,91,38,185,246,225,119,176,111,119,71,183,24,230,90,8,136,112,106,15,255,202,59,6,102,92,11,1,17,255,158,101,143,105,174,98,248,211,255,107,97,69,207,108,22,120,226,10,160,238,210,13,215,84,131,4,78,194,179,3,57,97,38,103,167,247,22,96,208,77,71,105,73,219,119,110,62,74,106,209,174,220,90,214,217,102,11,223,64,240,59,216,55,83,174,188,169,197,158,187,222,127,207,178,71,233,255,181,48,28,242,189,189,138,194,186,202,48,147,179,83,166,163,180,36,5,54,208,186,147,6,215,205,41,87,222,84,191,103,217,35,46,122,102,179,184,74,97,196,2,27,104,93,148,43,111,42,55,190,11,180,161,142,12,195,27,223,5,90,141,239,2,45,0,0,0,0,65,49,27,25,130,98,54,50,195,83,45,43,4,197,108,100,69,244,119,125,134,167,90,86,199,150,65,79,8,138,217,200,73,187,194,209,138,232,239,250,203,217,244,227,12,79,181,172,77,126,174,181,142,45,131,158,207,28,152,135,81,18,194,74,16,35,217,83,211,112,244,120,146,65,239,97,85,215,174,46,20,230,181,55,215,181,152,28,150,132,131,5,89,152,27,130,24,169,0,155,219,250,45,176,154,203,54,169,93,93,119,230,28,108,108,255,223,63,65,212,158,14,90,205,162,36,132,149,227,21,159,140,32,70,178,167,97,119,169,190,166,225,232,241,231,208,243,232,36,131,222,195,101,178,197,218,170,174,93,93,235,159,70,68,40,204,107,111,105,253,112,118,174,107,49,57,239,90,42,32,44,9,7,11,109,56,28,18,243,54,70,223,178,7,93,198,113,84,112,237,48,101,107,244,247,243,42,187,182,194,49,162,117,145,28,137,52,160,7,144,251,188,159,23,186,141,132,14,121,222,169,37,56,239,178,60,255,121,243,115,190,72,232,106,125,27,197,65,60,42,222,88,5,79,121,240,68,126,98,233,135,45,79,194,198,28,84,219,1,138,21,148,64,187,14,141,131,232,35,166,194,217,56,191,13,197,160,56,76,244,187,33,143,167,150,10,206,150,141,19,9,0,204,92,72,49,215,69,139,98,250,110,202,83,225,119,84,93,187,186,21,108,160,163,214,63,141,136,151,14,150,145,80,152,215,222,17,169,204,199,210,250,225,236,147,203,250,245,92,215,98,114,29,230,121,107,222,181,84,64,159,132,79,89,88,18,14,22,25,35,21,15,218,112,56,36,155,65,35,61,167,107,253,101,230,90,230,124,37,9,203,87,100,56,208,78,163,174,145,1,226,159,138,24,33,204,167,51,96,253,188,42,175,225,36,173,238,208,63,180,45,131,18,159,108,178,9,134,171,36,72,201,234,21,83,208,41,70,126,251,104,119,101,226,246,121,63,47,183,72,36,54,116,27,9,29,53,42,18,4,242,188,83,75,179,141,72,82,112,222,101,121,49,239,126,96,254,243,230,231,191,194,253,254,124,145,208,213,61,160,203,204,250,54,138,131,187,7,145,154,120,84,188,177,57,101,167,168,75,152,131,59,10,169,152,34,201,250,181,9,136,203,174,16,79,93,239,95,14,108,244,70,205,63,217,109,140,14,194,116,67,18,90,243,2,35,65,234,193,112,108,193,128,65,119,216,71,215,54,151,6,230,45,142,197,181,0,165,132,132,27,188,26,138,65,113,91,187,90,104,152,232,119,67,217,217,108,90,30,79,45,21,95,126,54,12,156,45,27,39,221,28,0,62,18,0,152,185,83,49,131,160,144,98,174,139,209,83,181,146,22,197,244,221,87,244,239,196,148,167,194,239,213,150,217,246,233,188,7,174,168,141,28,183,107,222,49,156,42,239,42,133,237,121,107,202,172,72,112,211,111,27,93,248,46,42,70,225,225,54,222,102,160,7,197,127,99,84,232,84,34,101,243,77,229,243,178,2,164,194,169,27,103,145,132,48,38,160,159,41,184,174,197,228,249,159,222,253,58,204,243,214,123,253,232,207,188,107,169,128,253,90,178,153,62,9,159,178,127,56,132,171,176,36,28,44,241,21,7,53,50,70,42,30,115,119,49,7,180,225,112,72,245,208,107,81,54,131,70,122,119,178,93,99,78,215,250,203,15,230,225,210,204,181,204,249,141,132,215,224,74,18,150,175,11,35,141,182,200,112,160,157,137,65,187,132,70,93,35,3,7,108,56,26,196,63,21,49,133,14,14,40,66,152,79,103,3,169,84,126,192,250,121,85,129,203,98,76,31,197,56,129,94,244,35,152,157,167,14,179,220,150,21,170,27,0,84,229,90,49,79,252,153,98,98,215,216,83,121,206,23,79,225,73,86,126,250,80,149,45,215,123,212,28,204,98,19,138,141,45,82,187,150,52,145,232,187,31,208,217,160,6,236,243,126,94,173,194,101,71,110,145,72,108,47,160,83,117,232,54,18,58,169,7,9,35,106,84,36,8,43,101,63,17,228,121,167,150,165,72,188,143,102,27,145,164,39,42,138,189,224,188,203,242,161,141,208,235,98,222,253,192,35,239,230,217,189,225,188,20,252,208,167,13,63,131,138,38,126,178,145,63,185,36,208,112,248,21,203,105,59,70,230,66,122,119,253,91,181,107,101,220,244,90,126,197,55,9,83,238,118,56,72,247,177,174,9,184,240,159,18,161,51,204,63,138,114,253,36,147,0,0,0,0,55,106,194,1,110,212,132,3,89,190,70,2,220,168,9,7,235,194,203,6,178,124,141,4,133,22,79,5,184,81,19,14,143,59,209,15,214,133,151,13,225,239,85,12,100,249,26,9,83,147,216,8,10,45,158,10,61,71,92,11,112,163,38,28,71,201,228,29,30,119,162,31,41,29,96,30,172,11,47,27,155,97,237,26,194,223,171,24,245,181,105,25,200,242,53,18,255,152,247,19,166,38,177,17,145,76,115,16,20,90,60,21,35,48,254,20,122,142,184,22,77,228,122,23,224,70,77,56,215,44,143,57,142,146,201,59,185,248,11,58,60,238,68,63,11,132,134,62,82,58,192,60,101,80,2,61,88,23,94,54,111,125,156,55,54,195,218,53,1,169,24,52,132,191,87,49,179,213,149,48,234,107,211,50,221,1,17,51,144,229,107,36,167,143,169,37,254,49,239,39,201,91,45,38,76,77,98,35,123,39,160,34,34,153,230,32,21,243,36,33,40,180,120,42,31,222,186,43,70,96,252,41,113,10,62,40,244,28,113,45,195,118,179,44,154,200,245,46,173,162,55,47,192,141,154,112,247,231,88,113,174,89,30,115,153,51,220,114,28,37,147,119,43,79,81,118,114,241,23,116,69,155,213,117,120,220,137,126,79,182,75,127,22,8,13,125,33,98,207,124,164,116,128,121,147,30,66,120,202,160,4,122,253,202,198,123,176,46,188,108,135,68,126,109,222,250,56,111,233,144,250,110,108,134,181,107,91,236,119,106,2,82,49,104,53,56,243,105,8,127,175,98,63,21,109,99,102,171,43,97,81,193,233,96,212,215,166,101,227,189,100,100,186,3,34,102,141,105,224,103,32,203,215,72,23,161,21,73,78,31,83,75,121,117,145,74,252,99,222,79,203,9,28,78,146,183,90,76,165,221,152,77,152,154,196,70,175,240,6,71,246,78,64,69,193,36,130,68,68,50,205,65,115,88,15,64,42,230,73,66,29,140,139,67,80,104,241,84,103,2,51,85,62,188,117,87,9,214,183,86,140,192,248,83,187,170,58,82,226,20,124,80,213,126,190,81,232,57,226,90,223,83,32,91,134,237,102,89,177,135,164,88,52,145,235,93,3,251,41,92,90,69,111,94,109,47,173,95,128,27,53,225,183,113,247,224,238,207,177,226,217,165,115,227,92,179,60,230,107,217,254,231,50,103,184,229,5,13,122,228,56,74,38,239,15,32,228,238,86,158,162,236,97,244,96,237,228,226,47,232,211,136,237,233,138,54,171,235,189,92,105,234,240,184,19,253,199,210,209,252,158,108,151,254,169,6,85,255,44,16,26,250,27,122,216,251,66,196,158,249,117,174,92,248,72,233,0,243,127,131,194,242,38,61,132,240,17,87,70,241,148,65,9,244,163,43,203,245,250,149,141,247,205,255,79,246,96,93,120,217,87,55,186,216,14,137,252,218,57,227,62,219,188,245,113,222,139,159,179,223,210,33,245,221,229,75,55,220,216,12,107,215,239,102,169,214,182,216,239,212,129,178,45,213,4,164,98,208,51,206,160,209,106,112,230,211,93,26,36,210,16,254,94,197,39,148,156,196,126,42,218,198,73,64,24,199,204,86,87,194,251,60,149,195,162,130,211,193,149,232,17,192,168,175,77,203,159,197,143,202,198,123,201,200,241,17,11,201,116,7,68,204,67,109,134,205,26,211,192,207,45,185,2,206,64,150,175,145,119,252,109,144,46,66,43,146,25,40,233,147,156,62,166,150,171,84,100,151,242,234,34,149,197,128,224,148,248,199,188,159,207,173,126,158,150,19,56,156,161,121,250,157,36,111,181,152,19,5,119,153,74,187,49,155,125,209,243,154,48,53,137,141,7,95,75,140,94,225,13,142,105,139,207,143,236,157,128,138,219,247,66,139,130,73,4,137,181,35,198,136,136,100,154,131,191,14,88,130,230,176,30,128,209,218,220,129,84,204,147,132,99,166,81,133,58,24,23,135,13,114,213,134,160,208,226,169,151,186,32,168,206,4,102,170,249,110,164,171,124,120,235,174,75,18,41,175,18,172,111,173,37,198,173,172,24,129,241,167,47,235,51,166,118,85,117,164,65,63,183,165,196,41,248,160,243,67,58,161,170,253,124,163,157,151,190,162,208,115,196,181,231,25,6,180,190,167,64,182,137,205,130,183,12,219,205,178,59,177,15,179,98,15,73,177,85,101,139,176,104,34,215,187,95,72,21,186,6,246,83,184,49,156,145,185,180,138,222,188,131,224,28,189,218,94,90,191,237,52,152,190,0,0,0,0,101,103,188,184,139,200,9,170,238,175,181,18,87,151,98,143,50,240,222,55,220,95,107,37,185,56,215,157,239,40,180,197,138,79,8,125,100,224,189,111,1,135,1,215,184,191,214,74,221,216,106,242,51,119,223,224,86,16,99,88,159,87,25,80,250,48,165,232,20,159,16,250,113,248,172,66,200,192,123,223,173,167,199,103,67,8,114,117,38,111,206,205,112,127,173,149,21,24,17,45,251,183,164,63,158,208,24,135,39,232,207,26,66,143,115,162,172,32,198,176,201,71,122,8,62,175,50,160,91,200,142,24,181,103,59,10,208,0,135,178,105,56,80,47,12,95,236,151,226,240,89,133,135,151,229,61,209,135,134,101,180,224,58,221,90,79,143,207,63,40,51,119,134,16,228,234,227,119,88,82,13,216,237,64,104,191,81,248,161,248,43,240,196,159,151,72,42,48,34,90,79,87,158,226,246,111,73,127,147,8,245,199,125,167,64,213,24,192,252,109,78,208,159,53,43,183,35,141,197,24,150,159,160,127,42,39,25,71,253,186,124,32,65,2,146,143,244,16,247,232,72,168,61,88,20,155,88,63,168,35,182,144,29,49,211,247,161,137,106,207,118,20,15,168,202,172,225,7,127,190,132,96,195,6,210,112,160,94,183,23,28,230,89,184,169,244,60,223,21,76,133,231,194,209,224,128,126,105,14,47,203,123,107,72,119,195,162,15,13,203,199,104,177,115,41,199,4,97,76,160,184,217,245,152,111,68,144,255,211,252,126,80,102,238,27,55,218,86,77,39,185,14,40,64,5,182,198,239,176,164,163,136,12,28,26,176,219,129,127,215,103,57,145,120,210,43,244,31,110,147,3,247,38,59,102,144,154,131,136,63,47,145,237,88,147,41,84,96,68,180,49,7,248,12,223,168,77,30,186,207,241,166,236,223,146,254,137,184,46,70,103,23,155,84,2,112,39,236,187,72,240,113,222,47,76,201,48,128,249,219,85,231,69,99,156,160,63,107,249,199,131,211,23,104,54,193,114,15,138,121,203,55,93,228,174,80,225,92,64,255,84,78,37,152,232,246,115,136,139,174,22,239,55,22,248,64,130,4,157,39,62,188,36,31,233,33,65,120,85,153,175,215,224,139,202,176,92,51,59,182,89,237,94,209,229,85,176,126,80,71,213,25,236,255,108,33,59,98,9,70,135,218,231,233,50,200,130,142,142,112,212,158,237,40,177,249,81,144,95,86,228,130,58,49,88,58,131,9,143,167,230,110,51,31,8,193,134,13,109,166,58,181,164,225,64,189,193,134,252,5,47,41,73,23,74,78,245,175,243,118,34,50,150,17,158,138,120,190,43,152,29,217,151,32,75,201,244,120,46,174,72,192,192,1,253,210,165,102,65,106,28,94,150,247,121,57,42,79,151,150,159,93,242,241,35,229,5,25,107,77,96,126,215,245,142,209,98,231,235,182,222,95,82,142,9,194,55,233,181,122,217,70,0,104,188,33,188,208,234,49,223,136,143,86,99,48,97,249,214,34,4,158,106,154,189,166,189,7,216,193,1,191,54,110,180,173,83,9,8,21,154,78,114,29,255,41,206,165,17,134,123,183,116,225,199,15,205,217,16,146,168,190,172,42,70,17,25,56,35,118,165,128,117,102,198,216,16,1,122,96,254,174,207,114,155,201,115,202,34,241,164,87,71,150,24,239,169,57,173,253,204,94,17,69,6,238,77,118,99,137,241,206,141,38,68,220,232,65,248,100,81,121,47,249,52,30,147,65,218,177,38,83,191,214,154,235,233,198,249,179,140,161,69,11,98,14,240,25,7,105,76,161,190,81,155,60,219,54,39,132,53,153,146,150,80,254,46,46,153,185,84,38,252,222,232,158,18,113,93,140,119,22,225,52,206,46,54,169,171,73,138,17,69,230,63,3,32,129,131,187,118,145,224,227,19,246,92,91,253,89,233,73,152,62,85,241,33,6,130,108,68,97,62,212,170,206,139,198,207,169,55,126,56,65,127,214,93,38,195,110,179,137,118,124,214,238,202,196,111,214,29,89,10,177,161,225,228,30,20,243,129,121,168,75,215,105,203,19,178,14,119,171,92,161,194,185,57,198,126,1,128,254,169,156,229,153,21,36,11,54,160,54,110,81,28,142,167,22,102,134,194,113,218,62,44,222,111,44,73,185,211,148,240,129,4,9,149,230,184,177,123,73,13,163,30,46,177,27,72,62,210,67,45,89,110,251,195,246,219,233,166,145,103,81,31,169,176,204,122,206,12,116,148,97,185,102,241,6,5,222,0,0,0,0,119,7,48,150,238,14,97,44,153,9,81,186,7,109,196,25,112,106,244,143,233,99,165,53,158,100,149,163,14,219,136,50,121,220,184,164,224,213,233,30,151,210,217,136,9,182,76,43,126,177,124,189,231,184,45,7,144,191,29,145,29,183,16,100,106,176,32,242,243,185,113,72,132,190,65,222,26,218,212,125,109,221,228,235,244,212,181,81,131,211,133,199,19,108,152,86,100,107,168,192,253,98,249,122,138,101,201,236,20,1,92,79,99,6,108,217,250,15,61,99,141,8,13,245,59,110,32,200,76,105,16,94,213,96,65,228,162,103,113,114,60,3,228,209,75,4,212,71,210,13,133,253,165,10,181,107,53,181,168,250,66,178,152,108,219,187,201,214,172,188,249,64,50,216,108,227,69,223,92,117,220,214,13,207,171,209,61,89,38,217,48,172,81,222,0,58,200,215,81,128,191,208,97,22,33,180,244,181,86,179,196,35,207,186,149,153,184,189,165,15,40,2,184,158,95,5,136,8,198,12,217,178,177,11,233,36,47,111,124,135,88,104,76,17,193,97,29,171,182,102,45,61,118,220,65,144,1,219,113,6,152,210,32,188,239,213,16,42,113,177,133,137,6,182,181,31,159,191,228,165,232,184,212,51,120,7,201,162,15,0,249,52,150,9,168,142,225,14,152,24,127,106,13,187,8,109,61,45,145,100,108,151,230,99,92,1,107,107,81,244,28,108,97,98,133,101,48,216,242,98,0,78,108,6,149,237,27,1,165,123,130,8,244,193,245,15,196,87,101,176,217,198,18,183,233,80,139,190,184,234,252,185,136,124,98,221,29,223,21,218,45,73,140,211,124,243,251,212,76,101,77,178,97,88,58,181,81,206,163,188,0,116,212,187,48,226,74,223,165,65,61,216,149,215,164,209,196,109,211,214,244,251,67,105,233,106,52,110,217,252,173,103,136,70,218,96,184,208,68,4,45,115,51,3,29,229,170,10,76,95,221,13,124,201,80,5,113,60,39,2,65,170,190,11,16,16,201,12,32,134,87,104,181,37,32,111,133,179,185,102,212,9,206,97,228,159,94,222,249,14,41,217,201,152,176,208,152,34,199,215,168,180,89,179,61,23,46,180,13,129,183,189,92,59,192,186,108,173,237,184,131,32,154,191,179,182,3,182,226,12,116,177,210,154,234,213,71,57,157,210,119,175,4,219,38,21,115,220,22,131,227,99,11,18,148,100,59,132,13,109,106,62,122,106,90,168,228,14,207,11,147,9,255,157,10,0,174,39,125,7,158,177,240,15,147,68,135,8,163,210,30,1,242,104,105,6,194,254,247,98,87,93,128,101,103,203,25,108,54,113,110,107,6,231,254,212,27,118,137,211,43,224,16,218,122,90,103,221,74,204,249,185,223,111,142,190,239,249,23,183,190,67,96,176,142,213,214,214,163,232,161,209,147,126,56,216,194,196,79,223,242,82,209,187,103,241,166,188,87,103,63,181,6,221,72,178,54,75,216,13,43,218,175,10,27,76,54,3,74,246,65,4,122,96,223,96,239,195,168,103,223,85,49,110,142,239,70,105,190,121,203,97,179,140,188,102,131,26,37,111,210,160,82,104,226,54,204,12,119,149,187,11,71,3,34,2,22,185,85,5,38,47,197,186,59,190,178,189,11,40,43,180,90,146,92,179,106,4,194,215,255,167,181,208,207,49,44,217,158,139,91,222,174,29,155,100,194,176,236,99,242,38,117,106,163,156,2,109,147,10,156,9,6,169,235,14,54,63,114,7,103,133,5,0,87,19,149,191,74,130,226,184,122,20,123,177,43,174,12,182,27,56,146,210,142,155,229,213,190,13,124,220,239,183,11,219,223,33,134,211,210,212,241,212,226,66,104,221,179,248,31,218,131,110,129,190,22,205,246,185,38,91,111,176,119,225,24,183,71,119,136,8,90,230,255,15,106,112,102,6,59,202,17,1,11,92,143,101,158,255,248,98,174,105,97,107,255,211,22,108,207,69,160,10,226,120,215,13,210,238,78,4,131,84,57,3,179,194,167,103,38,97,208,96,22,247,73,105,71,77,62,110,119,219,174,209,106,74,217,214,90,220,64,223,11,102,55,216,59,240,169,188,174,83,222,187,158,197,71,178,207,127,48,181,255,233,189,189,242,28,202,186,194,138,83,179,147,48,36,180,163,166,186,208,54,5,205,215,6,147,84,222,87,41,35,217,103,191,179,102,122,46,196,97,74,184,93,104,27,2,42,111,43,148,180,11,190,55,195,12,142,161,90,5,223,27,45,2,239,141,0,0,0,0,25,27,49,65,50,54,98,130,43,45,83,195,100,108,197,4,125,119,244,69,86,90,167,134,79,65,150,199,200,217,138,8,209,194,187,73,250,239,232,138,227,244,217,203,172,181,79,12,181,174,126,77,158,131,45,142,135,152,28,207,74,194,18,81,83,217,35,16,120,244,112,211,97,239,65,146,46,174,215,85,55,181,230,20,28,152,181,215,5,131,132,150,130,27,152,89,155,0,169,24,176,45,250,219,169,54,203,154,230,119,93,93,255,108,108,28,212,65,63,223,205,90,14,158,149,132,36,162,140,159,21,227,167,178,70,32,190,169,119,97,241,232,225,166,232,243,208,231,195,222,131,36,218,197,178,101,93,93,174,170,68,70,159,235,111,107,204,40,118,112,253,105,57,49,107,174,32,42,90,239,11,7,9,44,18,28,56,109,223,70,54,243,198,93,7,178,237,112,84,113,244,107,101,48,187,42,243,247,162,49,194,182,137,28,145,117,144,7,160,52,23,159,188,251,14,132,141,186,37,169,222,121,60,178,239,56,115,243,121,255,106,232,72,190,65,197,27,125,88,222,42,60,240,121,79,5,233,98,126,68,194,79,45,135,219,84,28,198,148,21,138,1,141,14,187,64,166,35,232,131,191,56,217,194,56,160,197,13,33,187,244,76,10,150,167,143,19,141,150,206,92,204,0,9,69,215,49,72,110,250,98,139,119,225,83,202,186,187,93,84,163,160,108,21,136,141,63,214,145,150,14,151,222,215,152,80,199,204,169,17,236,225,250,210,245,250,203,147,114,98,215,92,107,121,230,29,64,84,181,222,89,79,132,159,22,14,18,88,15,21,35,25,36,56,112,218,61,35,65,155,101,253,107,167,124,230,90,230,87,203,9,37,78,208,56,100,1,145,174,163,24,138,159,226,51,167,204,33,42,188,253,96,173,36,225,175,180,63,208,238,159,18,131,45,134,9,178,108,201,72,36,171,208,83,21,234,251,126,70,41,226,101,119,104,47,63,121,246,54,36,72,183,29,9,27,116,4,18,42,53,75,83,188,242,82,72,141,179,121,101,222,112,96,126,239,49,231,230,243,254,254,253,194,191,213,208,145,124,204,203,160,61,131,138,54,250,154,145,7,187,177,188,84,120,168,167,101,57,59,131,152,75,34,152,169,10,9,181,250,201,16,174,203,136,95,239,93,79,70,244,108,14,109,217,63,205,116,194,14,140,243,90,18,67,234,65,35,2,193,108,112,193,216,119,65,128,151,54,215,71,142,45,230,6,165,0,181,197,188,27,132,132,113,65,138,26,104,90,187,91,67,119,232,152,90,108,217,217,21,45,79,30,12,54,126,95,39,27,45,156,62,0,28,221,185,152,0,18,160,131,49,83,139,174,98,144,146,181,83,209,221,244,197,22,196,239,244,87,239,194,167,148,246,217,150,213,174,7,188,233,183,28,141,168,156,49,222,107,133,42,239,42,202,107,121,237,211,112,72,172,248,93,27,111,225,70,42,46,102,222,54,225,127,197,7,160,84,232,84,99,77,243,101,34,2,178,243,229,27,169,194,164,48,132,145,103,41,159,160,38,228,197,174,184,253,222,159,249,214,243,204,58,207,232,253,123,128,169,107,188,153,178,90,253,178,159,9,62,171,132,56,127,44,28,36,176,53,7,21,241,30,42,70,50,7,49,119,115,72,112,225,180,81,107,208,245,122,70,131,54,99,93,178,119,203,250,215,78,210,225,230,15,249,204,181,204,224,215,132,141,175,150,18,74,182,141,35,11,157,160,112,200,132,187,65,137,3,35,93,70,26,56,108,7,49,21,63,196,40,14,14,133,103,79,152,66,126,84,169,3,85,121,250,192,76,98,203,129,129,56,197,31,152,35,244,94,179,14,167,157,170,21,150,220,229,84,0,27,252,79,49,90,215,98,98,153,206,121,83,216,73,225,79,23,80,250,126,86,123,215,45,149,98,204,28,212,45,141,138,19,52,150,187,82,31,187,232,145,6,160,217,208,94,126,243,236,71,101,194,173,108,72,145,110,117,83,160,47,58,18,54,232,35,9,7,169,8,36,84,106,17,63,101,43,150,167,121,228,143,188,72,165,164,145,27,102,189,138,42,39,242,203,188,224,235,208,141,161,192,253,222,98,217,230,239,35,20,188,225,189,13,167,208,252,38,138,131,63,63,145,178,126,112,208,36,185,105,203,21,248,66,230,70,59,91,253,119,122,220,101,107,181,197,126,90,244,238,83,9,55,247,72,56,118,184,9,174,177,161,18,159,240,138,63,204,51,147,36,253,114,0,0,0,0,1,194,106,55,3,132,212,110,2,70,190,89,7,9,168,220,6,203,194,235,4,141,124,178,5,79,22,133,14,19,81,184,15,209,59,143,13,151,133,214,12,85,239,225,9,26,249,100,8,216,147,83,10,158,45,10,11,92,71,61,28,38,163,112,29,228,201,71,31,162,119,30,30,96,29,41,27,47,11,172,26,237,97,155,24,171,223,194,25,105,181,245,18,53,242,200,19,247,152,255,17,177,38,166,16,115,76,145,21,60,90,20,20,254,48,35,22,184,142,122,23,122,228,77,56,77,70,224,57,143,44,215,59,201,146,142,58,11,248,185,63,68,238,60,62,134,132,11,60,192,58,82,61,2,80,101,54,94,23,88,55,156,125,111,53,218,195,54,52,24,169,1,49,87,191,132,48,149,213,179,50,211,107,234,51,17,1,221,36,107,229,144,37,169,143,167,39,239,49,254,38,45,91,201,35,98,77,76,34,160,39,123,32,230,153,34,33,36,243,21,42,120,180,40,43,186,222,31,41,252,96,70,40,62,10,113,45,113,28,244,44,179,118,195,46,245,200,154,47,55,162,173,112,154,141,192,113,88,231,247,115,30,89,174,114,220,51,153,119,147,37,28,118,81,79,43,116,23,241,114,117,213,155,69,126,137,220,120,127,75,182,79,125,13,8,22,124,207,98,33,121,128,116,164,120,66,30,147,122,4,160,202,123,198,202,253,108,188,46,176,109,126,68,135,111,56,250,222,110,250,144,233,107,181,134,108,106,119,236,91,104,49,82,2,105,243,56,53,98,175,127,8,99,109,21,63,97,43,171,102,96,233,193,81,101,166,215,212,100,100,189,227,102,34,3,186,103,224,105,141,72,215,203,32,73,21,161,23,75,83,31,78,74,145,117,121,79,222,99,252,78,28,9,203,76,90,183,146,77,152,221,165,70,196,154,152,71,6,240,175,69,64,78,246,68,130,36,193,65,205,50,68,64,15,88,115,66,73,230,42,67,139,140,29,84,241,104,80,85,51,2,103,87,117,188,62,86,183,214,9,83,248,192,140,82,58,170,187,80,124,20,226,81,190,126,213,90,226,57,232,91,32,83,223,89,102,237,134,88,164,135,177,93,235,145,52,92,41,251,3,94,111,69,90,95,173,47,109,225,53,27,128,224,247,113,183,226,177,207,238,227,115,165,217,230,60,179,92,231,254,217,107,229,184,103,50,228,122,13,5,239,38,74,56,238,228,32,15,236,162,158,86,237,96,244,97,232,47,226,228,233,237,136,211,235,171,54,138,234,105,92,189,253,19,184,240,252,209,210,199,254,151,108,158,255,85,6,169,250,26,16,44,251,216,122,27,249,158,196,66,248,92,174,117,243,0,233,72,242,194,131,127,240,132,61,38,241,70,87,17,244,9,65,148,245,203,43,163,247,141,149,250,246,79,255,205,217,120,93,96,216,186,55,87,218,252,137,14,219,62,227,57,222,113,245,188,223,179,159,139,221,245,33,210,220,55,75,229,215,107,12,216,214,169,102,239,212,239,216,182,213,45,178,129,208,98,164,4,209,160,206,51,211,230,112,106,210,36,26,93,197,94,254,16,196,156,148,39,198,218,42,126,199,24,64,73,194,87,86,204,195,149,60,251,193,211,130,162,192,17,232,149,203,77,175,168,202,143,197,159,200,201,123,198,201,11,17,241,204,68,7,116,205,134,109,67,207,192,211,26,206,2,185,45,145,175,150,64,144,109,252,119,146,43,66,46,147,233,40,25,150,166,62,156,151,100,84,171,149,34,234,242,148,224,128,197,159,188,199,248,158,126,173,207,156,56,19,150,157,250,121,161,152,181,111,36,153,119,5,19,155,49,187,74,154,243,209,125,141,137,53,48,140,75,95,7,142,13,225,94,143,207,139,105,138,128,157,236,139,66,247,219,137,4,73,130,136,198,35,181,131,154,100,136,130,88,14,191,128,30,176,230,129,220,218,209,132,147,204,84,133,81,166,99,135,23,24,58,134,213,114,13,169,226,208,160,168,32,186,151,170,102,4,206,171,164,110,249,174,235,120,124,175,41,18,75,173,111,172,18,172,173,198,37,167,241,129,24,166,51,235,47,164,117,85,118,165,183,63,65,160,248,41,196,161,58,67,243,163,124,253,170,162,190,151,157,181,196,115,208,180,6,25,231,182,64,167,190,183,130,205,137,178,205,219,12,179,15,177,59,177,73,15,98,176,139,101,85,187,215,34,104,186,21,72,95,184,83,246,6,185,145,156,49,188,222,138,180,189,28,224,131,191,90,94,218,190,152,52,237,0,0,0,0,184,188,103,101,170,9,200,139,18,181,175,238,143,98,151,87,55,222,240,50,37,107,95,220,157,215,56,185,197,180,40,239,125,8,79,138,111,189,224,100,215,1,135,1,74,214,191,184,242,106,216,221,224,223,119,51,88,99,16,86,80,25,87,159,232,165,48,250,250,16,159,20,66,172,248,113,223,123,192,200,103,199,167,173,117,114,8,67,205,206,111,38,149,173,127,112,45,17,24,21,63,164,183,251,135,24,208,158,26,207,232,39,162,115,143,66,176,198,32,172,8,122,71,201,160,50,175,62,24,142,200,91,10,59,103,181,178,135,0,208,47,80,56,105,151,236,95,12,133,89,240,226,61,229,151,135,101,134,135,209,221,58,224,180,207,143,79,90,119,51,40,63,234,228,16,134,82,88,119,227,64,237,216,13,248,81,191,104,240,43,248,161,72,151,159,196,90,34,48,42,226,158,87,79,127,73,111,246,199,245,8,147,213,64,167,125,109,252,192,24,53,159,208,78,141,35,183,43,159,150,24,197,39,42,127,160,186,253,71,25,2,65,32,124,16,244,143,146,168,72,232,247,155,20,88,61,35,168,63,88,49,29,144,182,137,161,247,211,20,118,207,106,172,202,168,15,190,127,7,225,6,195,96,132,94,160,112,210,230,28,23,183,244,169,184,89,76,21,223,60,209,194,231,133,105,126,128,224,123,203,47,14,195,119,72,107,203,13,15,162,115,177,104,199,97,4,199,41,217,184,160,76,68,111,152,245,252,211,255,144,238,102,80,126,86,218,55,27,14,185,39,77,182,5,64,40,164,176,239,198,28,12,136,163,129,219,176,26,57,103,215,127,43,210,120,145,147,110,31,244,59,38,247,3,131,154,144,102,145,47,63,136,41,147,88,237,180,68,96,84,12,248,7,49,30,77,168,223,166,241,207,186,254,146,223,236,70,46,184,137,84,155,23,103,236,39,112,2,113,240,72,187,201,76,47,222,219,249,128,48,99,69,231,85,107,63,160,156,211,131,199,249,193,54,104,23,121,138,15,114,228,93,55,203,92,225,80,174,78,84,255,64,246,232,152,37,174,139,136,115,22,55,239,22,4,130,64,248,188,62,39,157,33,233,31,36,153,85,120,65,139,224,215,175,51,92,176,202,237,89,182,59,85,229,209,94,71,80,126,176,255,236,25,213,98,59,33,108,218,135,70,9,200,50,233,231,112,142,142,130,40,237,158,212,144,81,249,177,130,228,86,95,58,88,49,58,167,143,9,131,31,51,110,230,13,134,193,8,181,58,166,109,189,64,225,164,5,252,134,193,23,73,41,47,175,245,78,74,50,34,118,243,138,158,17,150,152,43,190,120,32,151,217,29,120,244,201,75,192,72,174,46,210,253,1,192,106,65,102,165,247,150,94,28,79,42,57,121,93,159,150,151,229,35,241,242,77,107,25,5,245,215,126,96,231,98,209,142,95,222,182,235,194,9,142,82,122,181,233,55,104,0,70,217,208,188,33,188,136,223,49,234,48,99,86,143,34,214,249,97,154,106,158,4,7,189,166,189,191,1,193,216,173,180,110,54,21,8,9,83,29,114,78,154,165,206,41,255,183,123,134,17,15,199,225,116,146,16,217,205,42,172,190,168,56,25,17,70,128,165,118,35,216,198,102,117,96,122,1,16,114,207,174,254,202,115,201,155,87,164,241,34,239,24,150,71,253,173,57,169,69,17,94,204,118,77,238,6,206,241,137,99,220,68,38,141,100,248,65,232,249,47,121,81,65,147,30,52,83,38,177,218,235,154,214,191,179,249,198,233,11,69,161,140,25,240,14,98,161,76,105,7,60,155,81,190,132,39,54,219,150,146,153,53,46,46,254,80,38,84,185,153,158,232,222,252,140,93,113,18,52,225,22,119,169,54,46,206,17,138,73,171,3,63,230,69,187,131,129,32,227,224,145,118,91,92,246,19,73,233,89,253,241,85,62,152,108,130,6,33,212,62,97,68,198,139,206,170,126,55,169,207,214,127,65,56,110,195,38,93,124,118,137,179,196,202,238,214,89,29,214,111,225,161,177,10,243,20,30,228,75,168,121,129,19,203,105,215,171,119,14,178,185,194,161,92,1,126,198,57,156,169,254,128,36,21,153,229,54,160,54,11,142,28,81,110,134,102,22,167,62,218,113,194,44,111,222,44,148,211,185,73,9,4,129,240,177,184,230,149,163,13,73,123,27,177,46,30,67,210,62,72,251,110,89,45,233,219,246,195,81,103,145,166,204,176,169,31,116,12,206,122,102,185,97,148,222,5,6,241,0,0,0,0,0,0,0,0,4,0,0,0,4,0,4,0,8,0,4,0,5,0,0,0,4,0,5,0,16,0,8,0,5,0,0,0,4,0,6,0,32,0,32,0,5,0,0,0,4,0,4,0,16,0,16,0,6,0,0,0,8,0,16,0,32,0,32,0,6,0,0,0,8,0,16,0,128,0,128,0,6,0,0,0,8,0,32,0,128,0,0,1,6,0,0,0,32,0,128,0,2,1,0,4,6,0,0,0,32,0,2,1,2,1,0,16,6,0,0,0,186,46,0,0,24,33,0,0,1,1,0,0,30,1,0,0,15,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,2,0,0,0,2,0,0,0,2,0,0,0,2,0,0,0,3,0,0,0,3,0,0,0,3,0,0,0,3,0,0,0,4,0,0,0,4,0,0,0,4,0,0,0,4,0,0,0,5,0,0,0,5,0,0,0,5,0,0,0,5,0,0,0,0,0,0,0,58,51,0,0,160,33,0,0,0,0,0,0,30,0,0,0,15,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,2,0,0,0,2,0,0,0,3,0,0,0,3,0,0,0,4,0,0,0,4,0,0,0,5,0,0,0,5,0,0,0,6,0,0,0,6,0,0,0,7,0,0,0,7,0,0,0,8,0,0,0,8,0,0,0,9,0,0,0,9,0,0,0,10,0,0,0,10,0,0,0,11,0,0,0,11,0,0,0,12,0,0,0,12,0,0,0,13,0,0,0,13,0,0,0,0,0,0,0,44,34,0,0,0,0,0,0,19,0,0,0,7,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,3,0,0,0,7,0,0,0,0,0,0,0,1,0,0,0,2,0,0,0,3,0,0,0,4,0,0,0,5,0,0,0,6,0,0,0,7,0,0,0,8,0,0,0,10,0,0,0,12,0,0,0,14,0,0,0,16,0,0,0,20,0,0,0,24,0,0,0,28,0,0,0,32,0,0,0,40,0,0,0,48,0,0,0,56,0,0,0,64,0,0,0,80,0,0,0,96,0,0,0,112,0,0,0,128,0,0,0,160,0,0,0,192,0,0,0,224,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,2,0,0,0,3,0,0,0,4,0,0,0,6,0,0,0,8,0,0,0,12,0,0,0,16,0,0,0,24,0,0,0,32,0,0,0,48,0,0,0,64,0,0,0,96,0,0,0,128,0,0,0,192,0,0,0,0,1,0,0,128,1,0,0,0,2,0,0,0,3,0,0,0,4,0,0,0,6,0,0,0,8,0,0,0,12,0,0,0,16,0,0,0,24,0,0,0,32,0,0,0,48,0,0,0,64,0,0,0,96,0,0,5,0,0,0,0,0,0,0,0,0,0,0,7,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,9,0,0,0,248,69,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,0,0,0,0,7,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,0,0,0,9,0,0,0,0,70,0,0,0,4,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,12,0,0,0,13,0,0,0,14,0,0,0,15,0,0,0,16,0,0,0,17,0,0,0,18,0,0,0,19,0,0,0,0,0,0,0,32,0,0,0,12,0,0,0,20,0,0,0,14,0,0,0,15,0,0,0,16,0,0,0,21,0,0,0,22,0,0,0,23,0,0,0,0,0,0,0,72,0,0,0,24,0,0,0,25,0,0,0,26,0,0,0,96,7,0,0,0,8,80,0,0,8,16,0,20,8,115,0,18,7,31,0,0,8,112,0,0,8,48,0,0,9,192,0,16,7,10,0,0,8,96,0,0,8,32,0,0,9,160,0,0,8,0,0,0,8,128,0,0,8,64,0,0,9,224,0,16,7,6,0,0,8,88,0,0,8,24,0,0,9,144,0,19,7,59,0,0,8,120,0,0,8,56,0,0,9,208,0,17,7,17,0,0,8,104,0,0,8,40,0,0,9,176,0,0,8,8,0,0,8,136,0,0,8,72,0,0,9,240,0,16,7,4,0,0,8,84,0,0,8,20,0,21,8,227,0,19,7,43,0,0,8,116,0,0,8,52,0,0,9,200,0,17,7,13,0,0,8,100,0,0,8,36,0,0,9,168,0,0,8,4,0,0,8,132,0,0,8,68,0,0,9,232,0,16,7,8,0,0,8,92,0,0,8,28,0,0,9,152,0,20,7,83,0,0,8,124,0,0,8,60,0,0,9,216,0,18,7,23,0,0,8,108,0,0,8,44,0,0,9,184,0,0,8,12,0,0,8,140,0,0,8,76,0,0,9,248,0,16,7,3,0,0,8,82,0,0,8,18,0,21,8,163,0,19,7,35,0,0,8,114,0,0,8,50,0,0,9,196,0,17,7,11,0,0,8,98,0,0,8,34,0,0,9,164,0,0,8,2,0,0,8,130,0,0,8,66,0,0,9,228,0,16,7,7,0,0,8,90,0,0,8,26,0,0,9,148,0,20,7,67,0,0,8,122,0,0,8,58,0,0,9,212,0,18,7,19,0,0,8,106,0,0,8,42,0,0,9,180,0,0,8,10,0,0,8,138,0,0,8,74,0,0,9,244,0,16,7,5,0,0,8,86,0,0,8,22,0,64,8,0,0,19,7,51,0,0,8,118,0,0,8,54,0,0,9,204,0,17,7,15,0,0,8,102,0,0,8,38,0,0,9,172,0,0,8,6,0,0,8,134,0,0,8,70,0,0,9,236,0,16,7,9,0,0,8,94,0,0,8,30,0,0,9,156,0,20,7,99,0,0,8,126,0,0,8,62,0,0,9,220,0,18,7,27,0,0,8,110,0,0,8,46,0,0,9,188,0,0,8,14,0,0,8,142,0,0,8,78,0,0,9,252,0,96,7,0,0,0,8,81,0,0,8,17,0,21,8,131,0,18,7,31,0,0,8,113,0,0,8,49,0,0,9,194,0,16,7,10,0,0,8,97,0,0,8,33,0,0,9,162,0,0,8,1,0,0,8,129,0,0,8,65,0,0,9,226,0,16,7,6,0,0,8,89,0,0,8,25,0,0,9,146,0,19,7,59,0,0,8,121,0,0,8,57,0,0,9,210,0,17,7,17,0,0,8,105,0,0,8,41,0,0,9,178,0,0,8,9,0,0,8,137,0,0,8,73,0,0,9,242,0,16,7,4,0,0,8,85,0,0,8,21,0,16,8,2,1,19,7,43,0,0,8,117,0,0,8,53,0,0,9,202,0,17,7,13,0,0,8,101,0,0,8,37,0,0,9,170,0,0,8,5,0,0,8,133,0,0,8,69,0,0,9,234,0,16,7,8,0,0,8,93,0,0,8,29,0,0,9,154,0,20,7,83,0,0,8,125,0,0,8,61,0,0,9,218,0,18,7,23,0,0,8,109,0,0,8,45,0,0,9,186], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);
/* memory initializer */ allocate([8,13,0,0,8,141,0,0,8,77,0,0,9,250,0,16,7,3,0,0,8,83,0,0,8,19,0,21,8,195,0,19,7,35,0,0,8,115,0,0,8,51,0,0,9,198,0,17,7,11,0,0,8,99,0,0,8,35,0,0,9,166,0,0,8,3,0,0,8,131,0,0,8,67,0,0,9,230,0,16,7,7,0,0,8,91,0,0,8,27,0,0,9,150,0,20,7,67,0,0,8,123,0,0,8,59,0,0,9,214,0,18,7,19,0,0,8,107,0,0,8,43,0,0,9,182,0,0,8,11,0,0,8,139,0,0,8,75,0,0,9,246,0,16,7,5,0,0,8,87,0,0,8,23,0,64,8,0,0,19,7,51,0,0,8,119,0,0,8,55,0,0,9,206,0,17,7,15,0,0,8,103,0,0,8,39,0,0,9,174,0,0,8,7,0,0,8,135,0,0,8,71,0,0,9,238,0,16,7,9,0,0,8,95,0,0,8,31,0,0,9,158,0,20,7,99,0,0,8,127,0,0,8,63,0,0,9,222,0,18,7,27,0,0,8,111,0,0,8,47,0,0,9,190,0,0,8,15,0,0,8,143,0,0,8,79,0,0,9,254,0,96,7,0,0,0,8,80,0,0,8,16,0,20,8,115,0,18,7,31,0,0,8,112,0,0,8,48,0,0,9,193,0,16,7,10,0,0,8,96,0,0,8,32,0,0,9,161,0,0,8,0,0,0,8,128,0,0,8,64,0,0,9,225,0,16,7,6,0,0,8,88,0,0,8,24,0,0,9,145,0,19,7,59,0,0,8,120,0,0,8,56,0,0,9,209,0,17,7,17,0,0,8,104,0,0,8,40,0,0,9,177,0,0,8,8,0,0,8,136,0,0,8,72,0,0,9,241,0,16,7,4,0,0,8,84,0,0,8,20,0,21,8,227,0,19,7,43,0,0,8,116,0,0,8,52,0,0,9,201,0,17,7,13,0,0,8,100,0,0,8,36,0,0,9,169,0,0,8,4,0,0,8,132,0,0,8,68,0,0,9,233,0,16,7,8,0,0,8,92,0,0,8,28,0,0,9,153,0,20,7,83,0,0,8,124,0,0,8,60,0,0,9,217,0,18,7,23,0,0,8,108,0,0,8,44,0,0,9,185,0,0,8,12,0,0,8,140,0,0,8,76,0,0,9,249,0,16,7,3,0,0,8,82,0,0,8,18,0,21,8,163,0,19,7,35,0,0,8,114,0,0,8,50,0,0,9,197,0,17,7,11,0,0,8,98,0,0,8,34,0,0,9,165,0,0,8,2,0,0,8,130,0,0,8,66,0,0,9,229,0,16,7,7,0,0,8,90,0,0,8,26,0,0,9,149,0,20,7,67,0,0,8,122,0,0,8,58,0,0,9,213,0,18,7,19,0,0,8,106,0,0,8,42,0,0,9,181,0,0,8,10,0,0,8,138,0,0,8,74,0,0,9,245,0,16,7,5,0,0,8,86,0,0,8,22,0,64,8,0,0,19,7,51,0,0,8,118,0,0,8,54,0,0,9,205,0,17,7,15,0,0,8,102,0,0,8,38,0,0,9,173,0,0,8,6,0,0,8,134,0,0,8,70,0,0,9,237,0,16,7,9,0,0,8,94,0,0,8,30,0,0,9,157,0,20,7,99,0,0,8,126,0,0,8,62,0,0,9,221,0,18,7,27,0,0,8,110,0,0,8,46,0,0,9,189,0,0,8,14,0,0,8,142,0,0,8,78,0,0,9,253,0,96,7,0,0,0,8,81,0,0,8,17,0,21,8,131,0,18,7,31,0,0,8,113,0,0,8,49,0,0,9,195,0,16,7,10,0,0,8,97,0,0,8,33,0,0,9,163,0,0,8,1,0,0,8,129,0,0,8,65,0,0,9,227,0,16,7,6,0,0,8,89,0,0,8,25,0,0,9,147,0,19,7,59,0,0,8,121,0,0,8,57,0,0,9,211,0,17,7,17,0,0,8,105,0,0,8,41,0,0,9,179,0,0,8,9,0,0,8,137,0,0,8,73,0,0,9,243,0,16,7,4,0,0,8,85,0,0,8,21,0,16,8,2,1,19,7,43,0,0,8,117,0,0,8,53,0,0,9,203,0,17,7,13,0,0,8,101,0,0,8,37,0,0,9,171,0,0,8,5,0,0,8,133,0,0,8,69,0,0,9,235,0,16,7,8,0,0,8,93,0,0,8,29,0,0,9,155,0,20,7,83,0,0,8,125,0,0,8,61,0,0,9,219,0,18,7,23,0,0,8,109,0,0,8,45,0,0,9,187,0,0,8,13,0,0,8,141,0,0,8,77,0,0,9,251,0,16,7,3,0,0,8,83,0,0,8,19,0,21,8,195,0,19,7,35,0,0,8,115,0,0,8,51,0,0,9,199,0,17,7,11,0,0,8,99,0,0,8,35,0,0,9,167,0,0,8,3,0,0,8,131,0,0,8,67,0,0,9,231,0,16,7,7,0,0,8,91,0,0,8,27,0,0,9,151,0,20,7,67,0,0,8,123,0,0,8,59,0,0,9,215,0,18,7,19,0,0,8,107,0,0,8,43,0,0,9,183,0,0,8,11,0,0,8,139,0,0,8,75,0,0,9,247,0,16,7,5,0,0,8,87,0,0,8,23,0,64,8,0,0,19,7,51,0,0,8,119,0,0,8,55,0,0,9,207,0,17,7,15,0,0,8,103,0,0,8,39,0,0,9,175,0,0,8,7,0,0,8,135,0,0,8,71,0,0,9,239,0,16,7,9,0,0,8,95,0,0,8,31,0,0,9,159,0,20,7,99,0,0,8,127,0,0,8,63,0,0,9,223,0,18,7,27,0,0,8,111,0,0,8,47,0,0,9,191,0,0,8,15,0,0,8,143,0,0,8,79,0,0,9,255,0,16,5,1,0,23,5,1,1,19,5,17,0,27,5,1,16,17,5,5,0,25,5,1,4,21,5,65,0,29,5,1,64,16,5,3,0,24,5,1,2,20,5,33,0,28,5,1,32,18,5,9,0,26,5,1,8,22,5,129,0,64,5,0,0,16,5,2,0,23,5,129,1,19,5,25,0,27,5,1,24,17,5,7,0,25,5,1,6,21,5,97,0,29,5,1,96,16,5,4,0,24,5,1,3,20,5,49,0,28,5,1,48,18,5,13,0,26,5,1,12,22,5,193,0,64,5,0,0,16,0,17,0,18,0,0,0,8,0,7,0,9,0,6,0,10,0,5,0,11,0,4,0,12,0,3,0,13,0,2,0,14,0,1,0,15,0,3,0,4,0,5,0,6,0,7,0,8,0,9,0,10,0,11,0,13,0,15,0,17,0,19,0,23,0,27,0,31,0,35,0,43,0,51,0,59,0,67,0,83,0,99,0,115,0,131,0,163,0,195,0,227,0,2,1,0,0,0,0,16,0,16,0,16,0,16,0,16,0,16,0,16,0,16,0,17,0,17,0,17,0,17,0,18,0,18,0,18,0,18,0,19,0,19,0,19,0,19,0,20,0,20,0,20,0,20,0,21,0,21,0,21,0,21,0,16,0,72,0,78,0,1,0,2,0,3,0,4,0,5,0,7,0,9,0,13,0,17,0,25,0,33,0,49,0,65,0,97,0,129,0,193,0,1,1,129,1,1,2,1,3,1,4,1,6,1,8,1,12,1,16,1,24,1,32,1,48,1,64,1,96,0,0,0,0,16,0,16,0,16,0,16,0,17,0,17,0,18,0,18,0,19,0,19,0,20,0,20,0,21,0,21,0,22,0,22,0,23,0,23,0,24,0,24,0,25,0,25,0,26,0,26,0,27,0,27,0,28,0,28,0,29,0,29,0,64,0,64,0,12,0,8,0,140,0,8,0,76,0,8,0,204,0,8,0,44,0,8,0,172,0,8,0,108,0,8,0,236,0,8,0,28,0,8,0,156,0,8,0,92,0,8,0,220,0,8,0,60,0,8,0,188,0,8,0,124,0,8,0,252,0,8,0,2,0,8,0,130,0,8,0,66,0,8,0,194,0,8,0,34,0,8,0,162,0,8,0,98,0,8,0,226,0,8,0,18,0,8,0,146,0,8,0,82,0,8,0,210,0,8,0,50,0,8,0,178,0,8,0,114,0,8,0,242,0,8,0,10,0,8,0,138,0,8,0,74,0,8,0,202,0,8,0,42,0,8,0,170,0,8,0,106,0,8,0,234,0,8,0,26,0,8,0,154,0,8,0,90,0,8,0,218,0,8,0,58,0,8,0,186,0,8,0,122,0,8,0,250,0,8,0,6,0,8,0,134,0,8,0,70,0,8,0,198,0,8,0,38,0,8,0,166,0,8,0,102,0,8,0,230,0,8,0,22,0,8,0,150,0,8,0,86,0,8,0,214,0,8,0,54,0,8,0,182,0,8,0,118,0,8,0,246,0,8,0,14,0,8,0,142,0,8,0,78,0,8,0,206,0,8,0,46,0,8,0,174,0,8,0,110,0,8,0,238,0,8,0,30,0,8,0,158,0,8,0,94,0,8,0,222,0,8,0,62,0,8,0,190,0,8,0,126,0,8,0,254,0,8,0,1,0,8,0,129,0,8,0,65,0,8,0,193,0,8,0,33,0,8,0,161,0,8,0,97,0,8,0,225,0,8,0,17,0,8,0,145,0,8,0,81,0,8,0,209,0,8,0,49,0,8,0,177,0,8,0,113,0,8,0,241,0,8,0,9,0,8,0,137,0,8,0,73,0,8,0,201,0,8,0,41,0,8,0,169,0,8,0,105,0,8,0,233,0,8,0,25,0,8,0,153,0,8,0,89,0,8,0,217,0,8,0,57,0,8,0,185,0,8,0,121,0,8,0,249,0,8,0,5,0,8,0,133,0,8,0,69,0,8,0,197,0,8,0,37,0,8,0,165,0,8,0,101,0,8,0,229,0,8,0,21,0,8,0,149,0,8,0,85,0,8,0,213,0,8,0,53,0,8,0,181,0,8,0,117,0,8,0,245,0,8,0,13,0,8,0,141,0,8,0,77,0,8,0,205,0,8,0,45,0,8,0,173,0,8,0,109,0,8,0,237,0,8,0,29,0,8,0,157,0,8,0,93,0,8,0,221,0,8,0,61,0,8,0,189,0,8,0,125,0,8,0,253,0,8,0,19,0,9,0,19,1,9,0,147,0,9,0,147,1,9,0,83,0,9,0,83,1,9,0,211,0,9,0,211,1,9,0,51,0,9,0,51,1,9,0,179,0,9,0,179,1,9,0,115,0,9,0,115,1,9,0,243,0,9,0,243,1,9,0,11,0,9,0,11,1,9,0,139,0,9,0,139,1,9,0,75,0,9,0,75,1,9,0,203,0,9,0,203,1,9,0,43,0,9,0,43,1,9,0,171,0,9,0,171,1,9,0,107,0,9,0,107,1,9,0,235,0,9,0,235,1,9,0,27,0,9,0,27,1,9,0,155,0,9,0,155,1,9,0,91,0,9,0,91,1,9,0,219,0,9,0,219,1,9,0,59,0,9,0,59,1,9,0,187,0,9,0,187,1,9,0,123,0,9,0,123,1,9,0,251,0,9,0,251,1,9,0,7,0,9,0,7,1,9,0,135,0,9,0,135,1,9,0,71,0,9,0,71,1,9,0,199,0,9,0,199,1,9,0,39,0,9,0,39,1,9,0,167,0,9,0,167,1,9,0,103,0,9,0,103,1,9,0,231,0,9,0,231,1,9,0,23,0,9,0,23,1,9,0,151,0,9,0,151,1,9,0,87,0,9,0,87,1,9,0,215,0,9,0,215,1,9,0,55,0,9,0,55,1,9,0,183,0,9,0,183,1,9,0,119,0,9,0,119,1,9,0,247,0,9,0,247,1,9,0,15,0,9,0,15,1,9,0,143,0,9,0,143,1,9,0,79,0,9,0,79,1,9,0,207,0,9,0,207,1,9,0,47,0,9,0,47,1,9,0,175,0,9,0,175,1,9,0,111,0,9,0,111,1,9,0,239,0,9,0,239,1,9,0,31,0,9,0,31,1,9,0,159,0,9,0,159,1,9,0,95,0,9,0,95,1,9,0,223,0,9,0,223,1,9,0,63,0,9,0,63,1,9,0,191,0,9,0,191,1,9,0,127,0,9,0,127,1,9,0,255,0,9,0,255,1,9,0,0,0,7,0,64,0,7,0,32,0,7,0,96,0,7,0,16,0,7,0,80,0,7,0,48,0,7,0,112,0,7,0,8,0,7,0,72,0,7,0,40,0,7,0,104,0,7,0,24,0,7,0,88,0,7,0,56,0,7,0,120,0,7,0,4,0,7,0,68,0,7,0,36,0,7,0,100,0,7,0,20,0,7,0,84,0,7,0,52,0,7,0,116,0,7,0,3,0,8,0,131,0,8,0,67,0,8,0,195,0,8,0,35,0,8,0,163,0,8,0,99,0,8,0,227,0,8,0,0,0,5,0,16,0,5,0,8,0,5,0,24,0,5,0,4,0,5,0,20,0,5,0,12,0,5,0,28,0,5,0,2,0,5,0,18,0,5,0,10,0,5,0,26,0,5,0,6,0,5,0,22,0,5,0,14,0,5,0,30,0,5,0,1,0,5,0,17,0,5,0,9,0,5,0,25,0,5,0,5,0,5,0,21,0,5,0,13,0,5,0,29,0,5,0,3,0,5,0,19,0,5,0,11,0,5,0,27,0,5,0,7,0,5,0,23,0,5,0,123,32,114,101,116,117,114,110,32,97,108,108,111,99,97,116,101,40,105,110,116,65,114,114,97,121,70,114,111,109,83,116,114,105,110,103,40,104,116,115,102,105,108,101,115,91,36,48,93,46,102,105,108,101,111,98,106,46,110,97,109,101,41,44,32,39,105,56,39,44,32,65,76,76,79,67,95,78,79,82,77,65,76,41,59,32,125,0,114,98,0,123,32,114,101,116,117,114,110,32,106,115,95,114,101,97,100,40,36,48,44,32,36,49,44,32,36,50,41,59,32,125,0,123,32,114,101,116,117,114,110,32,106,115,95,115,101,101,107,40,36,48,44,32,36,49,44,32,36,50,41,59,32,125,0,123,32,106,115,95,99,108,111,115,101,40,36,48,41,59,32,125,0,102,111,114,109,97,116,58,32,37,100,44,32,37,100,10,0,91,69,58,58,37,115,93,32,102,97,105,108,32,116,111,32,111,112,101,110,32,102,105,108,101,32,39,37,115,39,10,0,104,116,115,95,104,111,112,101,110,95,106,115,0,105,110,118,97,108,105,100,32,112,97,114,97,109,101,116,101,114,47,99,111,109,112,114,101,115,115,105,111,110,32,108,101,118,101,108,44,32,111,114,32,105,110,99,111,110,115,105,115,116,101,110,116,32,115,116,114,101,97,109,32,115,116,97,116,101,0,105,110,118,97,108,105,100,32,111,114,32,105,110,99,111,109,112,108,101,116,101,32,73,79,0,111,117,116,32,111,102,32,109,101,109,111,114,121,0,112,114,111,103,114,101,115,115,32,116,101,109,112,111,114,97,114,105,108,121,32,110,111,116,32,112,111,115,115,105,98,108,101,44,32,111,114,32,105,110,40,41,32,47,32,111,117,116,40,41,32,114,101,116,117,114,110,101,100,32,97,110,32,101,114,114,111,114,0,122,108,105,98,32,118,101,114,115,105,111,110,32,109,105,115,109,97,116,99,104,0,91,37,100,93,32,117,110,107,110,111,119,110,0,91,69,58,58,37,115,93,32,100,101,102,108,97,116,101,73,110,105,116,50,32,102,97,105,108,101,100,58,32,37,115,10,0,98,103,122,102,95,119,114,105,116,101,95,105,110,105,116,0,91,69,58,58,37,115,93,32,37,115,10,0,66,67,2,0,0,49,46,50,46,56,0,67,82,65,77,0,66,65,77,1,0,66,65,73,1,0,66,67,70,4,0,66,67,70,2,0,67,83,73,1,0,84,66,73,1,0,35,35,102,105,108,101,102,111,114,109,97,116,61,86,67,70,0,64,72,68,9,0,64,83,81,9,0,64,82,71,9,0,64,80,71,9,0,64,72,68,9,86,78,58,0,0,1,2,3,4,4,5,5,6,6,6,6,7,7,7,7,8,8,8,8,8,8,8,8,9,9,9,9,9,9,9,9,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,0,0,16,17,18,18,19,19,20,20,20,20,21,21,21,21,22,22,22,22,22,22,22,22,23,23,23,23,23,23,23,23,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,0,1,2,3,4,5,6,7,8,8,9,9,10,10,11,11,12,12,12,12,13,13,13,13,14,14,14,14,15,15,15,15,16,16,16,16,16,16,16,16,17,17,17,17,17,17,17,17,18,18,18,18,18,18,18,18,19,19,19,19,19,19,19,19,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,25,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,27,28,16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15,105,110,115,117,102,102,105,99,105,101,110,116,32,109,101,109,111,114,121,0,17,0,10,0,17,17,17,0,0,0,0,5,0,0,0,0,0,0,9,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,15,10,17,17,17,3,10,7,0,1,19,9,11,11,0,0,9,6,11,0,0,11,0,6,17,0,0,0,17,17,17,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,10,10,17,17,17,0,10,0,0,2,0,9,11,0,0,0,9,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14,0,0,0,0,0,0,0,0,0,0,0,13,0,0,0,4,13,0,0,0,0,9,14,0,0,0,0,0,14,0,0,14,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,0,0,0,0,0,0,0,0,15,0,0,0,0,15,0,0,0,0,9,16,0,0,0,0,0,16,0,0,16,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,0,0,0,10,0,0,0,0,10,0,0,0,0,9,11,0,0,0,0,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,48,49,50,51,52,53,54,55,56,57,65,66,67,68,69,70,45,43,32,32,32,48,88,48,120,0,84,33,34,25,13,1,2,3,17,75,28,12,16,4,11,29,18,30,39,104,110,111,112,113,98,32,5,6,15,19,20,21,26,8,22,7,40,36,23,24,9,10,14,27,31,37,35,131,130,125,38,42,43,60,61,62,63,67,71,74,77,88,89,90,91,92,93,94,95,96,97,99,100,101,102,103,105,106,107,108,114,115,116,121,122,123,124,0,73,108,108,101,103,97,108,32,98,121,116,101,32,115,101,113,117,101,110,99,101,0,68,111,109,97,105,110,32,101,114,114,111,114,0,82,101,115,117,108,116,32,110,111,116,32,114,101,112,114,101,115,101,110,116,97,98,108,101,0,78,111,116,32,97,32,116,116,121,0,80,101,114,109,105,115,115,105,111,110,32,100,101,110,105,101,100,0,79,112,101,114,97,116,105,111,110,32,110,111,116,32,112,101,114,109,105,116,116,101,100,0,78,111,32,115,117,99,104,32,102,105,108,101,32,111,114,32,100,105,114,101,99,116,111,114,121,0,78,111,32,115,117,99,104,32,112,114,111,99,101,115,115,0,70,105,108,101,32,101,120,105,115,116,115,0,86,97,108,117,101,32,116,111,111,32,108,97,114,103,101,32,102,111,114,32,100,97,116,97,32,116,121,112,101,0,78,111,32,115,112,97,99,101,32,108,101,102,116,32,111,110,32,100,101,118,105,99,101,0,79,117,116,32,111,102,32,109,101,109,111,114,121,0,82,101,115,111,117,114,99,101,32,98,117,115,121,0,73,110,116,101,114,114,117,112,116,101,100,32,115,121,115,116,101,109,32,99,97,108,108,0,82,101,115,111,117,114,99,101,32,116,101,109,112,111,114,97,114,105,108,121,32,117,110,97,118,97,105,108,97,98,108,101,0,73,110,118,97,108,105,100,32,115,101,101,107,0,67,114,111,115,115,45,100,101,118,105,99,101,32,108,105,110,107,0,82,101,97,100,45,111,110,108,121,32,102,105,108,101,32,115,121,115,116,101,109,0,68,105,114,101,99,116,111,114,121,32,110,111,116,32,101,109,112,116,121,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,112,101,101,114,0,79,112,101,114,97,116,105,111,110,32,116,105,109,101,100,32,111,117,116,0,67,111,110,110,101,99,116,105,111,110,32,114,101,102,117,115,101,100,0,72,111,115,116,32,105,115,32,100,111,119,110,0,72,111,115,116,32,105,115,32,117,110,114,101,97,99,104,97,98,108,101,0,65,100,100,114,101,115,115,32,105,110,32,117,115,101,0,66,114,111,107,101,110,32,112,105,112,101,0,73,47,79,32,101,114,114,111,114,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,32,111,114,32,97,100,100,114,101,115,115,0,66,108,111,99,107,32,100,101,118,105,99,101,32,114,101,113,117,105,114,101,100,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,0,78,111,116,32,97,32,100,105,114,101,99,116,111,114,121,0,73,115,32,97,32,100,105,114,101,99,116,111,114,121,0,84,101,120,116,32,102,105,108,101,32,98,117,115,121,0,69,120,101,99,32,102,111,114,109,97,116,32,101,114,114,111,114,0,73,110,118,97,108,105,100,32,97,114,103,117,109,101,110,116,0,65,114,103,117,109,101,110,116,32,108,105,115,116,32,116,111,111,32,108,111,110,103,0,83,121,109,98,111,108,105,99,32,108,105,110,107,32,108,111,111,112,0,70,105,108,101,110,97,109,101,32,116,111,111,32,108,111,110,103,0,84,111,111,32,109,97,110,121,32,111,112,101,110,32,102,105,108,101,115,32,105,110,32,115,121,115,116,101,109,0,78,111,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,115,32,97,118,97,105,108,97,98,108,101,0,66,97,100,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,0,78,111,32,99,104,105,108,100,32,112,114,111,99,101,115,115,0,66,97,100,32,97,100,100,114,101,115,115,0,70,105,108,101,32,116,111,111,32,108,97,114,103,101,0,84,111,111,32,109,97,110,121,32,108,105,110,107,115,0,78,111,32,108,111,99,107,115,32,97,118,97,105,108,97,98,108,101,0,82,101,115,111,117,114,99,101,32,100,101,97,100,108,111,99,107,32,119,111,117,108,100,32,111,99,99,117,114,0,83,116,97,116,101,32,110,111,116,32,114,101,99,111,118,101,114,97,98,108,101,0,80,114,101,118,105,111,117,115,32,111,119,110,101,114,32,100,105,101,100,0,79,112,101,114,97,116,105,111,110,32,99,97,110,99,101,108,101,100,0,70,117,110,99,116,105,111,110,32,110,111,116,32,105,109,112,108,101,109,101,110,116,101,100,0,78,111,32,109,101,115,115,97,103,101,32,111,102,32,100,101,115,105,114,101,100,32,116,121,112,101,0,73,100,101,110,116,105,102,105,101,114,32,114,101,109,111,118,101,100,0,68,101,118,105,99,101,32,110,111,116,32,97,32,115,116,114,101,97,109,0,78,111,32,100,97,116,97,32,97,118,97,105,108,97,98,108,101,0,68,101,118,105,99,101,32,116,105,109,101,111,117,116,0,79,117,116,32,111,102,32,115,116,114,101,97,109,115,32,114,101,115,111,117,114,99,101,115,0,76,105,110,107,32,104,97,115,32,98,101,101,110,32,115,101,118,101,114,101,100,0,80,114,111,116,111,99,111,108,32,101,114,114,111,114,0,66,97,100,32,109,101,115,115,97,103,101,0,70,105,108,101,32,100,101,115,99,114,105,112,116,111,114,32,105,110,32,98,97,100,32,115,116,97,116,101,0,78,111,116,32,97,32,115,111,99,107,101,116,0,68,101,115,116,105,110,97,116,105,111,110,32,97,100,100,114,101,115,115,32,114,101,113,117,105,114,101,100,0,77,101,115,115,97,103,101,32,116,111,111,32,108,97,114,103,101,0,80,114,111,116,111,99,111,108,32,119,114,111,110,103,32,116,121,112,101,32,102,111,114,32,115,111,99,107,101,116,0,80,114,111,116,111,99,111,108,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,80,114,111,116,111,99,111,108,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,83,111,99,107,101,116,32,116,121,112,101,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,78,111,116,32,115,117,112,112,111,114,116,101,100,0,80,114,111,116,111,99,111,108,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,65,100,100,114,101,115,115,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,32,98,121,32,112,114,111,116,111,99,111,108,0,65,100,100,114,101,115,115,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,78,101,116,119,111,114,107,32,105,115,32,100,111,119,110,0,78,101,116,119,111,114,107,32,117,110,114,101,97,99,104,97,98,108,101,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,110,101,116,119,111,114,107,0,67,111,110,110,101,99,116,105,111,110,32,97,98,111,114,116,101,100,0,78,111,32,98,117,102,102,101,114,32,115,112,97,99,101,32,97,118,97,105,108,97,98,108,101,0,83,111,99,107,101,116,32,105,115,32,99,111,110,110,101,99,116,101,100,0,83,111,99,107,101,116,32,110,111,116,32,99,111,110,110,101,99,116,101,100,0,67,97,110,110,111,116,32,115,101,110,100,32,97,102,116,101,114,32,115,111,99,107,101,116,32,115,104,117,116,100,111,119,110,0,79,112,101,114,97,116,105,111,110,32,97,108,114,101,97,100,121,32,105,110,32,112,114,111,103,114,101,115,115,0,79,112,101,114,97,116,105,111,110,32,105,110,32,112,114,111,103,114,101,115,115,0,83,116,97,108,101,32,102,105,108,101,32,104,97,110,100,108,101,0,82,101,109,111,116,101,32,73,47,79,32,101,114,114,111,114,0,81,117,111,116,97,32,101,120,99,101,101,100,101,100,0,78,111,32,109,101,100,105,117,109,32,102,111,117,110,100,0,87,114,111,110,103,32,109,101,100,105,117,109,32,116,121,112,101,0,78,111,32,101,114,114,111,114,32,105,110,102,111,114,109,97,116,105,111,110,0,0,40,110,117,108,108,41,0,45,48,88,43,48,88,32,48,88,45,48,120,43,48,120,32,48,120,0,105,110,102,0,73,78,70,0,110,97,110,0,78,65,78,0,46,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,48,95,95,115,105,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,54,95,95,115,104,105,109,95,116,121,112,101,95,105,110,102,111,69,0,83,116,57,116,121,112,101,95,105,110,102,111,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,55,95,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0,83,116,57,101,120,99,101,112,116,105,111,110,0,83,116,57,98,97,100,95,97,108,108,111,99,0,115,116,100,58,58,98,97,100,95,97,108,108,111,99,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,57,95,95,112,111,105,110,116,101,114,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,55,95,95,112,98,97,115,101,95,116,121,112,101,95,105,110,102,111,69,0,79,112,101,110,105,110,103,32,98,103,122,102,46,46,46,0,79,107,97,121,33,0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE+10241);





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  
  function _atexit(func, arg) {
      __ATEXIT__.unshift({ func: func, arg: arg });
    }function ___cxa_atexit() {
  return _atexit.apply(null, arguments)
  }

   
  Module["_i64Subtract"] = _i64Subtract;

   
  Module["_i64Add"] = _i64Add;

  
  function __ZSt18uncaught_exceptionv() { // std::uncaught_exception()
      return !!__ZSt18uncaught_exceptionv.uncaught_exception;
    }
  
  
  
  var EXCEPTIONS={last:0,caught:[],infos:{},deAdjust:function (adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted;
        for (var ptr in EXCEPTIONS.infos) {
          var info = EXCEPTIONS.infos[ptr];
          if (info.adjusted === adjusted) {
            return ptr;
          }
        }
        return adjusted;
      },addRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++;
      },decRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        assert(info.refcount > 0);
        info.refcount--;
        if (info.refcount === 0) {
          if (info.destructor) {
            Runtime.dynCall('vi', info.destructor, [ptr]);
          }
          delete EXCEPTIONS.infos[ptr];
          ___cxa_free_exception(ptr);
        }
      },clearRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0;
      }};
  function ___resumeException(ptr) {
      if (!EXCEPTIONS.last) { EXCEPTIONS.last = ptr; }
      EXCEPTIONS.clearRef(EXCEPTIONS.deAdjust(ptr)); // exception refcount should be cleared, but don't free it
      throw ptr;
    }function ___cxa_find_matching_catch() {
      var thrown = EXCEPTIONS.last;
      if (!thrown) {
        // just pass through the null ptr
        return ((asm["setTempRet0"](0),0)|0);
      }
      var info = EXCEPTIONS.infos[thrown];
      var throwntype = info.type;
      if (!throwntype) {
        // just pass through the thrown ptr
        return ((asm["setTempRet0"](0),thrown)|0);
      }
      var typeArray = Array.prototype.slice.call(arguments);
  
      var pointer = Module['___cxa_is_pointer_type'](throwntype);
      // can_catch receives a **, add indirection
      if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
      HEAP32[((___cxa_find_matching_catch.buffer)>>2)]=thrown;
      thrown = ___cxa_find_matching_catch.buffer;
      // The different catch blocks are denoted by different types.
      // Due to inheritance, those types may not precisely match the
      // type of the thrown object. Find one which matches, and
      // return the type of the catch block which should be called.
      for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module['___cxa_can_catch'](typeArray[i], throwntype, thrown)) {
          thrown = HEAP32[((thrown)>>2)]; // undo indirection
          info.adjusted = thrown;
          return ((asm["setTempRet0"](typeArray[i]),thrown)|0);
        }
      }
      // Shouldn't happen unless we have bogus data in typeArray
      // or encounter a type for which emscripten doesn't have suitable
      // typeinfo defined. Best-efforts match just in case.
      thrown = HEAP32[((thrown)>>2)]; // undo indirection
      return ((asm["setTempRet0"](throwntype),thrown)|0);
    }function ___cxa_throw(ptr, type, destructor) {
      EXCEPTIONS.infos[ptr] = {
        ptr: ptr,
        adjusted: ptr,
        type: type,
        destructor: destructor,
        refcount: 0
      };
      EXCEPTIONS.last = ptr;
      if (!("uncaught_exception" in __ZSt18uncaught_exceptionv)) {
        __ZSt18uncaught_exceptionv.uncaught_exception = 1;
      } else {
        __ZSt18uncaught_exceptionv.uncaught_exception++;
      }
      throw ptr;
    }

   
  Module["_memset"] = _memset;

  function _pthread_cleanup_push(routine, arg) {
      __ATEXIT__.push(function() { Runtime.dynCall('vi', routine, [arg]) })
      _pthread_cleanup_push.level = __ATEXIT__.length;
    }

   
  Module["_bitshift64Lshr"] = _bitshift64Lshr;

   
  Module["_bitshift64Shl"] = _bitshift64Shl;

  function _pthread_cleanup_pop() {
      assert(_pthread_cleanup_push.level == __ATEXIT__.length, 'cannot pop if something else added meanwhile!');
      __ATEXIT__.pop();
      _pthread_cleanup_push.level = __ATEXIT__.length;
    }

  function _abort() {
      Module['abort']();
    }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 
  Module["_memcpy"] = _memcpy;

  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    }
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};function _sysconf(name) {
      // long sysconf(int name);
      // http://pubs.opengroup.org/onlinepubs/009695399/functions/sysconf.html
      switch(name) {
        case 30: return PAGE_SIZE;
        case 85: return totalMemory / PAGE_SIZE;
        case 132:
        case 133:
        case 12:
        case 137:
        case 138:
        case 15:
        case 235:
        case 16:
        case 17:
        case 18:
        case 19:
        case 20:
        case 149:
        case 13:
        case 10:
        case 236:
        case 153:
        case 9:
        case 21:
        case 22:
        case 159:
        case 154:
        case 14:
        case 77:
        case 78:
        case 139:
        case 80:
        case 81:
        case 82:
        case 68:
        case 67:
        case 164:
        case 11:
        case 29:
        case 47:
        case 48:
        case 95:
        case 52:
        case 51:
        case 46:
          return 200809;
        case 79:
          return 0;
        case 27:
        case 246:
        case 127:
        case 128:
        case 23:
        case 24:
        case 160:
        case 161:
        case 181:
        case 182:
        case 242:
        case 183:
        case 184:
        case 243:
        case 244:
        case 245:
        case 165:
        case 178:
        case 179:
        case 49:
        case 50:
        case 168:
        case 169:
        case 175:
        case 170:
        case 171:
        case 172:
        case 97:
        case 76:
        case 32:
        case 173:
        case 35:
          return -1;
        case 176:
        case 177:
        case 7:
        case 155:
        case 8:
        case 157:
        case 125:
        case 126:
        case 92:
        case 93:
        case 129:
        case 130:
        case 131:
        case 94:
        case 91:
          return 1;
        case 74:
        case 60:
        case 69:
        case 70:
        case 4:
          return 1024;
        case 31:
        case 42:
        case 72:
          return 32;
        case 87:
        case 26:
        case 33:
          return 2147483647;
        case 34:
        case 1:
          return 47839;
        case 38:
        case 36:
          return 99;
        case 43:
        case 37:
          return 2048;
        case 0: return 2097152;
        case 3: return 65536;
        case 28: return 32768;
        case 44: return 32767;
        case 75: return 16384;
        case 39: return 1000;
        case 89: return 700;
        case 71: return 256;
        case 40: return 255;
        case 2: return 100;
        case 180: return 64;
        case 25: return 20;
        case 5: return 16;
        case 6: return 6;
        case 73: return 4;
        case 84: {
          if (typeof navigator === 'object') return navigator['hardwareConcurrency'] || 1;
          return 1;
        }
      }
      ___setErrNo(ERRNO_CODES.EINVAL);
      return -1;
    }

  function _puts(s) {
      // extra effort to support puts, even without a filesystem. very partial, very hackish
      var result = Pointer_stringify(s);
      var string = result.substr(0);
      if (string[string.length-1] === '\n') string = string.substr(0, string.length-1); // remove a final \n, as Module.print will do that
      Module.print(string);
      return result.length;
    }

   
  Module["_memmove"] = _memmove;

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffer) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___gxx_personality_v0() {
    }

  var _emscripten_asm_const_int=true;

   
  Module["_llvm_bswap_i32"] = _llvm_bswap_i32;

  function _sbrk(bytes) {
      // Implement a Linux-like 'memory area' for our 'process'.
      // Changes the size of the memory area by |bytes|; returns the
      // address of the previous top ('break') of the memory area
      // We control the "dynamic" memory - DYNAMIC_BASE to DYNAMICTOP
      var self = _sbrk;
      if (!self.called) {
        DYNAMICTOP = alignMemoryPage(DYNAMICTOP); // make sure we start out aligned
        self.called = true;
        assert(Runtime.dynamicAlloc);
        self.alloc = Runtime.dynamicAlloc;
        Runtime.dynamicAlloc = function() { abort('cannot dynamically allocate, sbrk now has control') };
      }
      var ret = DYNAMICTOP;
      if (bytes != 0) {
        var success = self.alloc(bytes);
        if (!success) return -1 >>> 0; // sbrk failure code
      }
      return ret;  // Previous break location.
    }

  function _time(ptr) {
      var ret = (Date.now()/1000)|0;
      if (ptr) {
        HEAP32[((ptr)>>2)]=ret;
      }
      return ret;
    }

  function _pthread_self() {
      //FIXME: assumes only a single thread
      return 0;
    }

  function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      var offset = offset_low;
      assert(offset_high === 0);
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  function _malloc(bytes) {
      /* Over-allocate to make sure it is byte-aligned by 8.
       * This will leak memory, but this is only the dummy
       * implementation (replaced by dlmalloc normally) so
       * not an issue.
       */
      var ptr = Runtime.dynamicAlloc(bytes + 8);
      return (ptr+8) & 0xFFFFFFF8;
    }
  Module["_malloc"] = _malloc;function ___cxa_allocate_exception(size) {
      return _malloc(size);
    }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  var ___dso_handle=STATICTOP; STATICTOP += 16;;
/* flush anything remaining in the buffer during shutdown */ __ATEXIT__.push(function() { var fflush = Module["_fflush"]; if (fflush) fflush(0); var printChar = ___syscall146.printChar; if (!printChar) return; var buffers = ___syscall146.buffers; if (buffers[1].length) printChar(1, 10); if (buffers[2].length) printChar(2, 10); });;
STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);

staticSealed = true; // seal the static portion of memory

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = DYNAMICTOP = Runtime.alignMemory(STACK_MAX);

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");

 var cttz_i8 = allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0], "i8", ALLOC_DYNAMIC);


function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iii(x) { Module["printErr"]("Invalid function pointer called with signature 'iii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viiiii(index,a1,a2,a3,a4,a5) {
  try {
    Module["dynCall_viiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vii(index,a1,a2) {
  try {
    Module["dynCall_vii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    Module["dynCall_viiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_iii(index,a1,a2) {
  try {
    return Module["dynCall_iii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viiii(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "nullFunc_iiii": nullFunc_iiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_ii": nullFunc_ii, "nullFunc_v": nullFunc_v, "nullFunc_viiiiii": nullFunc_viiiiii, "nullFunc_iii": nullFunc_iii, "nullFunc_viiii": nullFunc_viiii, "invoke_iiii": invoke_iiii, "invoke_viiiii": invoke_viiiii, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_ii": invoke_ii, "invoke_v": invoke_v, "invoke_viiiiii": invoke_viiiiii, "invoke_iii": invoke_iii, "invoke_viiii": invoke_viiii, "_pthread_cleanup_pop": _pthread_cleanup_pop, "___syscall6": ___syscall6, "___gxx_personality_v0": ___gxx_personality_v0, "___cxa_allocate_exception": ___cxa_allocate_exception, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "___setErrNo": ___setErrNo, "_sbrk": _sbrk, "_emscripten_memcpy_big": _emscripten_memcpy_big, "___resumeException": ___resumeException, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "_sysconf": _sysconf, "_pthread_self": _pthread_self, "_puts": _puts, "___syscall54": ___syscall54, "_emscripten_asm_const_iiii": _emscripten_asm_const_iiii, "___cxa_atexit": ___cxa_atexit, "___cxa_throw": ___cxa_throw, "_abort": _abort, "_pthread_cleanup_push": _pthread_cleanup_push, "_time": _time, "_atexit": _atexit, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "cttz_i8": cttz_i8, "___dso_handle": ___dso_handle };
// EMSCRIPTEN_START_ASM
var asm = (function(global, env, buffer) {
  'almost asm';
  
  
  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);


  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var cttz_i8=env.cttz_i8|0;
  var ___dso_handle=env.___dso_handle|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntP = 0, tempBigIntS = 0, tempBigIntR = 0.0, tempBigIntI = 0, tempBigIntD = 0, tempValue = 0, tempDouble = 0.0;

  var tempRet0 = 0;
  var tempRet1 = 0;
  var tempRet2 = 0;
  var tempRet3 = 0;
  var tempRet4 = 0;
  var tempRet5 = 0;
  var tempRet6 = 0;
  var tempRet7 = 0;
  var tempRet8 = 0;
  var tempRet9 = 0;
  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_vii=env.nullFunc_vii;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var nullFunc_iii=env.nullFunc_iii;
  var nullFunc_viiii=env.nullFunc_viiii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_vi=env.invoke_vi;
  var invoke_vii=env.invoke_vii;
  var invoke_ii=env.invoke_ii;
  var invoke_v=env.invoke_v;
  var invoke_viiiiii=env.invoke_viiiiii;
  var invoke_iii=env.invoke_iii;
  var invoke_viiii=env.invoke_viiii;
  var _pthread_cleanup_pop=env._pthread_cleanup_pop;
  var ___syscall6=env.___syscall6;
  var ___gxx_personality_v0=env.___gxx_personality_v0;
  var ___cxa_allocate_exception=env.___cxa_allocate_exception;
  var ___cxa_find_matching_catch=env.___cxa_find_matching_catch;
  var _emscripten_asm_const_ii=env._emscripten_asm_const_ii;
  var ___setErrNo=env.___setErrNo;
  var _sbrk=env._sbrk;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var ___resumeException=env.___resumeException;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var _sysconf=env._sysconf;
  var _pthread_self=env._pthread_self;
  var _puts=env._puts;
  var ___syscall54=env.___syscall54;
  var _emscripten_asm_const_iiii=env._emscripten_asm_const_iiii;
  var ___cxa_atexit=env.___cxa_atexit;
  var ___cxa_throw=env.___cxa_throw;
  var _abort=env._abort;
  var _pthread_cleanup_push=env._pthread_cleanup_push;
  var _time=env._time;
  var _atexit=env._atexit;
  var ___syscall140=env.___syscall140;
  var ___syscall146=env.___syscall146;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
if ((STACKTOP|0) >= (STACK_MAX|0)) abort();

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}
function copyTempFloat(ptr) {
  ptr = ptr|0;
  HEAP8[tempDoublePtr>>0] = HEAP8[ptr>>0];
  HEAP8[tempDoublePtr+1>>0] = HEAP8[ptr+1>>0];
  HEAP8[tempDoublePtr+2>>0] = HEAP8[ptr+2>>0];
  HEAP8[tempDoublePtr+3>>0] = HEAP8[ptr+3>>0];
}
function copyTempDouble(ptr) {
  ptr = ptr|0;
  HEAP8[tempDoublePtr>>0] = HEAP8[ptr>>0];
  HEAP8[tempDoublePtr+1>>0] = HEAP8[ptr+1>>0];
  HEAP8[tempDoublePtr+2>>0] = HEAP8[ptr+2>>0];
  HEAP8[tempDoublePtr+3>>0] = HEAP8[ptr+3>>0];
  HEAP8[tempDoublePtr+4>>0] = HEAP8[ptr+4>>0];
  HEAP8[tempDoublePtr+5>>0] = HEAP8[ptr+5>>0];
  HEAP8[tempDoublePtr+6>>0] = HEAP8[ptr+6>>0];
  HEAP8[tempDoublePtr+7>>0] = HEAP8[ptr+7>>0];
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function __ZNSt3__13mapIiP7htsFileNS_4lessIiEENS_9allocatorINS_4pairIKiS2_EEEEED2Ev($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($this)) + 4|0);
 $1 = HEAP32[$0>>2]|0;
 __ZNSt3__16__treeINS_12__value_typeIiP7htsFileEENS_19__map_value_compareIiS4_NS_4lessIiEELb1EEENS_9allocatorIS4_EEE7destroyEPNS_11__tree_nodeIS4_PvEE($this,$1);
 return;
}
function _bgzf_open_js($fid) {
 $fid = $fid|0;
 var $$0 = 0, $$0$i$i$i = 0, $$0$i$i$ph = 0, $$0$i$i2 = 0, $$0$i$i2$i$i = 0, $$0$i$i3 = 0, $$0$i1$i$i$i = 0, $$01$i$i = 0, $$01$i$i$in = 0, $$01$i$i$in$ph = 0, $$pre = 0, $$pre24 = 0, $$pre25 = 0, $$pre27 = 0, $$pre28 = 0, $$sroa$0$0 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0;
 var $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0;
 var $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0;
 var $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0;
 var $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0;
 var $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0;
 var $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0;
 var $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0;
 var $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0;
 var $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $__nd$0$i$i = 0, $__nd$1$i$i$in = 0, $__parent$i$sroa$0 = 0, $__r$0$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $__parent$i$sroa$0 = sp;
 $$0$i$i$ph = (17316);$$01$i$i$in$ph = (17316);
 L1: while(1) {
  $$01$i$i$in = $$01$i$i$in$ph;
  while(1) {
   $$01$i$i = HEAP32[$$01$i$i$in>>2]|0;
   $0 = ($$01$i$i|0)==(0|0);
   if ($0) {
    break L1;
   }
   $1 = ((($$01$i$i)) + 16|0);
   $2 = HEAP32[$1>>2]|0;
   $3 = ($2|0)<($fid|0);
   if (!($3)) {
    break;
   }
   $4 = ((($$01$i$i)) + 4|0);
   $$01$i$i$in = $4;
  }
  $$0$i$i$ph = $$01$i$i;$$01$i$i$in$ph = $$01$i$i;
 }
 $5 = ($$0$i$i$ph|0)==((17316)|0);
 if ($5) {
  label = 9;
 } else {
  $6 = $$0$i$i$ph;
  $7 = ((($$0$i$i$ph)) + 16|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = ($8|0)>($fid|0);
  if ($9) {
   label = 9;
  } else {
   $$sroa$0$0 = $6;
  }
 }
 if ((label|0) == 9) {
  $$sroa$0$0 = ((17316));
 }
 $10 = $$sroa$0$0;
 $11 = ($10|0)==((17316)|0);
 if (!($11)) {
  $$0 = 1;
  STACKTOP = sp;return ($$0|0);
 }
 $12 = (_malloc(36)|0);
 $13 = ($12|0)==(0|0);
 if ($13) {
  label = 14;
 } else {
  $14 = (_malloc(32768)|0);
  HEAP32[$12>>2] = $14;
  $15 = ($14|0)==(0|0);
  $16 = $14;
  if ($15) {
   label = 14;
  } else {
   $17 = ((($12)) + 8|0);
   HEAP32[$17>>2] = $16;
   $18 = ((($12)) + 4|0);
   HEAP32[$18>>2] = $16;
   $19 = ((($14)) + 32768|0);
   $20 = ((($12)) + 12|0);
   HEAP32[$20>>2] = $19;
   $21 = ((($12)) + 20|0);
   HEAP32[$21>>2] = 0;
   $22 = ((($12)) + 24|0);
   $23 = HEAP8[$22>>0]|0;
   $24 = $23 & -2;
   HEAP8[$22>>0] = $24;
   $25 = ((($12)) + 28|0);
   HEAP32[$25>>2] = 0;
   $$0$i$i3 = $12;
  }
 }
 if ((label|0) == 14) {
  $26 = HEAP32[4331]|0;
  $27 = ($26|0)==(0|0);
  if ($27) {
   $$0$i$i2$i$i = 17368;
  } else {
   $28 = (_pthread_self()|0);
   $29 = ((($28)) + 64|0);
   $30 = HEAP32[$29>>2]|0;
   $$0$i$i2$i$i = $30;
  }
  $31 = HEAP32[$$0$i$i2$i$i>>2]|0;
  if (!($13)) {
   $32 = HEAP32[$12>>2]|0;
   _free($32);
  }
  _free($12);
  $33 = HEAP32[4331]|0;
  $34 = ($33|0)==(0|0);
  if ($34) {
   $$0$i1$i$i$i = 17368;
  } else {
   $35 = (_pthread_self()|0);
   $36 = ((($35)) + 64|0);
   $37 = HEAP32[$36>>2]|0;
   $$0$i1$i$i$i = $37;
  }
  HEAP32[$$0$i1$i$i$i>>2] = $31;
  $$0$i$i3 = 0;
 }
 $38 = ((($$0$i$i3)) + 16|0);
 HEAP32[$38>>2] = 120;
 $39 = ((($$0$i$i3)) + 32|0);
 HEAP32[$39>>2] = $fid;
 $40 = _emscripten_asm_const_ii(0, ($fid|0))|0;
 $41 = $40;
 $42 = (__Z12hts_hopen_jsP5hFILEPcPKc($$0$i$i3,$41)|0);
 _free($41);
 $43 = HEAP32[(17316)>>2]|0;
 $44 = ($43|0)==(0|0);
 do {
  if ($44) {
   HEAP32[$__parent$i$sroa$0>>2] = ((17316));
   $$0$i$i2 = (17316);
  } else {
   $__nd$0$i$i = $43;
   while(1) {
    $45 = ((($__nd$0$i$i)) + 16|0);
    $46 = HEAP32[$45>>2]|0;
    $47 = ($46|0)>($fid|0);
    if ($47) {
     $48 = HEAP32[$__nd$0$i$i>>2]|0;
     $49 = ($48|0)==(0|0);
     if ($49) {
      label = 24;
      break;
     } else {
      $__nd$1$i$i$in = $48;
     }
    } else {
     $51 = ($46|0)<($fid|0);
     if (!($51)) {
      label = 28;
      break;
     }
     $52 = ((($__nd$0$i$i)) + 4|0);
     $53 = HEAP32[$52>>2]|0;
     $54 = ($53|0)==(0|0);
     if ($54) {
      label = 27;
      break;
     } else {
      $__nd$1$i$i$in = $53;
     }
    }
    $__nd$0$i$i = $__nd$1$i$i$in;
   }
   if ((label|0) == 24) {
    $50 = $__nd$0$i$i;
    HEAP32[$__parent$i$sroa$0>>2] = $50;
    $$0$i$i2 = $__nd$0$i$i;
    break;
   }
   else if ((label|0) == 27) {
    $55 = $__nd$0$i$i;
    HEAP32[$__parent$i$sroa$0>>2] = $55;
    $$0$i$i2 = $52;
    break;
   }
   else if ((label|0) == 28) {
    $56 = $__nd$0$i$i;
    HEAP32[$__parent$i$sroa$0>>2] = $56;
    $$0$i$i2 = $__parent$i$sroa$0;
    break;
   }
  }
 } while(0);
 $57 = HEAP32[$$0$i$i2>>2]|0;
 $58 = ($57|0)==(0|0);
 if ($58) {
  while(1) {
   $59 = (_malloc(24)|0);
   $60 = ($59|0)==(0|0);
   if (!($60)) {
    break;
   }
   $61 = HEAP32[4467]|0;HEAP32[4467] = (($61+0)|0);
   $62 = ($61|0)==(0);
   if ($62) {
    label = 35;
    break;
   }
   $63 = $61;
   FUNCTION_TABLE_v[$63 & 0]();
  }
  if ((label|0) == 35) {
   $64 = (___cxa_allocate_exception(4)|0);
   HEAP32[$64>>2] = (9484);
   ___cxa_throw(($64|0),(72|0),(24|0));
   // unreachable;
  }
  $65 = ((($59)) + 16|0);
  HEAP32[$65>>2] = $fid;
  $66 = ((($59)) + 20|0);
  HEAP32[$66>>2] = 0;
  $67 = HEAP32[$__parent$i$sroa$0>>2]|0;
  HEAP32[$59>>2] = 0;
  $68 = ((($59)) + 4|0);
  HEAP32[$68>>2] = 0;
  $69 = ((($59)) + 8|0);
  HEAP32[$69>>2] = $67;
  HEAP32[$$0$i$i2>>2] = $59;
  $70 = HEAP32[4328]|0;
  $71 = HEAP32[$70>>2]|0;
  $72 = ($71|0)==(0|0);
  if ($72) {
   $76 = $59;
  } else {
   $73 = HEAP32[$70>>2]|0;
   HEAP32[4328] = $73;
   $$pre = HEAP32[$$0$i$i2>>2]|0;
   $76 = $$pre;
  }
  $74 = HEAP32[(17316)>>2]|0;
  $75 = ($76|0)==($74|0);
  $77 = ((($76)) + 12|0);
  $78 = $75&1;
  HEAP8[$77>>0] = $78;
  $$0$i$i$i = $76;
  while(1) {
   $79 = ($$0$i$i$i|0)==($74|0);
   if ($79) {
    break;
   }
   $80 = ((($$0$i$i$i)) + 8|0);
   $81 = HEAP32[$80>>2]|0;
   $82 = ((($81)) + 12|0);
   $83 = HEAP8[$82>>0]|0;
   $84 = $83 & 1;
   $85 = ($84<<24>>24)==(0);
   if (!($85)) {
    break;
   }
   $86 = ((($81)) + 8|0);
   $87 = HEAP32[$86>>2]|0;
   $88 = HEAP32[$87>>2]|0;
   $89 = ($81|0)==($88|0);
   $90 = $87;
   if ($89) {
    $91 = ((($87)) + 4|0);
    $92 = HEAP32[$91>>2]|0;
    $93 = ($92|0)==(0|0);
    if ($93) {
     label = 45;
     break;
    }
    $94 = ((($92)) + 12|0);
    $95 = HEAP8[$94>>0]|0;
    $96 = $95 & 1;
    $97 = ($96<<24>>24)==(0);
    if (!($97)) {
     label = 45;
     break;
    }
    HEAP8[$82>>0] = 1;
    $98 = ($87|0)==($74|0);
    $99 = ((($87)) + 12|0);
    $100 = $98&1;
    HEAP8[$99>>0] = $100;
    HEAP8[$94>>0] = 1;
    $$0$i$i$i = $87;
    continue;
   } else {
    $132 = ($88|0)==(0|0);
    if ($132) {
     label = 61;
     break;
    }
    $133 = ((($88)) + 12|0);
    $134 = HEAP8[$133>>0]|0;
    $135 = $134 & 1;
    $136 = ($135<<24>>24)==(0);
    if (!($136)) {
     label = 61;
     break;
    }
    HEAP8[$82>>0] = 1;
    $137 = ($87|0)==($74|0);
    $138 = ((($87)) + 12|0);
    $139 = $137&1;
    HEAP8[$138>>0] = $139;
    HEAP8[$133>>0] = 1;
    $$0$i$i$i = $87;
    continue;
   }
  }
  if ((label|0) == 45) {
   $101 = HEAP32[$81>>2]|0;
   $102 = ($$0$i$i$i|0)==($101|0);
   if ($102) {
    $116 = $81;$118 = $87;
   } else {
    $103 = ((($81)) + 4|0);
    $104 = HEAP32[$103>>2]|0;
    $105 = HEAP32[$104>>2]|0;
    HEAP32[$103>>2] = $105;
    $106 = ($105|0)==(0);
    if ($106) {
     $110 = $90;
    } else {
     $107 = $105;
     $108 = ((($107)) + 8|0);
     HEAP32[$108>>2] = $81;
     $$pre27 = HEAP32[$86>>2]|0;
     $110 = $$pre27;
    }
    $109 = ((($104)) + 8|0);
    HEAP32[$109>>2] = $110;
    $111 = HEAP32[$86>>2]|0;
    $112 = HEAP32[$111>>2]|0;
    $113 = ($112|0)==($81|0);
    if ($113) {
     HEAP32[$111>>2] = $104;
    } else {
     $114 = ((($111)) + 4|0);
     HEAP32[$114>>2] = $104;
    }
    HEAP32[$104>>2] = $81;
    HEAP32[$86>>2] = $104;
    $$pre28 = HEAP32[$109>>2]|0;
    $116 = $104;$118 = $$pre28;
   }
   $115 = ((($116)) + 12|0);
   HEAP8[$115>>0] = 1;
   $117 = ((($118)) + 12|0);
   HEAP8[$117>>0] = 0;
   $119 = HEAP32[$118>>2]|0;
   $120 = ((($119)) + 4|0);
   $121 = HEAP32[$120>>2]|0;
   HEAP32[$118>>2] = $121;
   $122 = ($121|0)==(0);
   if (!($122)) {
    $123 = $121;
    $124 = ((($123)) + 8|0);
    HEAP32[$124>>2] = $118;
   }
   $125 = ((($118)) + 8|0);
   $126 = HEAP32[$125>>2]|0;
   $127 = ((($119)) + 8|0);
   HEAP32[$127>>2] = $126;
   $128 = HEAP32[$125>>2]|0;
   $129 = HEAP32[$128>>2]|0;
   $130 = ($129|0)==($118|0);
   if ($130) {
    HEAP32[$128>>2] = $119;
   } else {
    $131 = ((($128)) + 4|0);
    HEAP32[$131>>2] = $119;
   }
   HEAP32[$120>>2] = $118;
   HEAP32[$125>>2] = $119;
  }
  else if ((label|0) == 61) {
   $140 = HEAP32[$81>>2]|0;
   $141 = ($$0$i$i$i|0)==($140|0);
   if ($141) {
    $142 = HEAP32[$81>>2]|0;
    $143 = ((($142)) + 4|0);
    $144 = HEAP32[$143>>2]|0;
    HEAP32[$81>>2] = $144;
    $145 = ($144|0)==(0);
    if ($145) {
     $149 = $90;
    } else {
     $146 = $144;
     $147 = ((($146)) + 8|0);
     HEAP32[$147>>2] = $81;
     $$pre24 = HEAP32[$86>>2]|0;
     $149 = $$pre24;
    }
    $148 = ((($142)) + 8|0);
    HEAP32[$148>>2] = $149;
    $150 = HEAP32[$86>>2]|0;
    $151 = HEAP32[$150>>2]|0;
    $152 = ($151|0)==($81|0);
    if ($152) {
     HEAP32[$150>>2] = $142;
    } else {
     $153 = ((($150)) + 4|0);
     HEAP32[$153>>2] = $142;
    }
    HEAP32[$143>>2] = $81;
    HEAP32[$86>>2] = $142;
    $$pre25 = HEAP32[$148>>2]|0;
    $155 = $142;$157 = $$pre25;
   } else {
    $155 = $81;$157 = $87;
   }
   $154 = ((($155)) + 12|0);
   HEAP8[$154>>0] = 1;
   $156 = ((($157)) + 12|0);
   HEAP8[$156>>0] = 0;
   $158 = ((($157)) + 4|0);
   $159 = HEAP32[$158>>2]|0;
   $160 = HEAP32[$159>>2]|0;
   HEAP32[$158>>2] = $160;
   $161 = ($160|0)==(0);
   if (!($161)) {
    $162 = $160;
    $163 = ((($162)) + 8|0);
    HEAP32[$163>>2] = $157;
   }
   $164 = ((($157)) + 8|0);
   $165 = HEAP32[$164>>2]|0;
   $166 = ((($159)) + 8|0);
   HEAP32[$166>>2] = $165;
   $167 = HEAP32[$164>>2]|0;
   $168 = HEAP32[$167>>2]|0;
   $169 = ($168|0)==($157|0);
   if ($169) {
    HEAP32[$167>>2] = $159;
   } else {
    $170 = ((($167)) + 4|0);
    HEAP32[$170>>2] = $159;
   }
   HEAP32[$159>>2] = $157;
   HEAP32[$164>>2] = $159;
  }
  $171 = HEAP32[(17320)>>2]|0;
  $172 = (($171) + 1)|0;
  HEAP32[(17320)>>2] = $172;
  $__r$0$i = $59;
 } else {
  $__r$0$i = $57;
 }
 $173 = ((($__r$0$i)) + 20|0);
 HEAP32[$173>>2] = $42;
 $$0 = 0;
 STACKTOP = sp;return ($$0|0);
}
function __ZNSt3__16__treeINS_12__value_typeIiP7htsFileEENS_19__map_value_compareIiS4_NS_4lessIiEELb1EEENS_9allocatorIS4_EEE7destroyEPNS_11__tree_nodeIS4_PvEE($this,$__nd) {
 $this = $this|0;
 $__nd = $__nd|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($__nd|0)==(0|0);
 if ($0) {
  return;
 }
 $1 = HEAP32[$__nd>>2]|0;
 __ZNSt3__16__treeINS_12__value_typeIiP7htsFileEENS_19__map_value_compareIiS4_NS_4lessIiEELb1EEENS_9allocatorIS4_EEE7destroyEPNS_11__tree_nodeIS4_PvEE($this,$1);
 $2 = ((($__nd)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 __ZNSt3__16__treeINS_12__value_typeIiP7htsFileEENS_19__map_value_compareIiS4_NS_4lessIiEELb1EEENS_9allocatorIS4_EEE7destroyEPNS_11__tree_nodeIS4_PvEE($this,$3);
 _free($__nd);
 return;
}
function __GLOBAL__sub_I_bam_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[(17316)>>2] = 0;
 HEAP32[(17320)>>2] = 0;
 HEAP32[4328] = (17316);
 (___cxa_atexit((27|0),(17312|0),(___dso_handle|0))|0);
 return;
}
function __ZL7js_readP5hFILEPvj($fp,$buffer,$nbytes) {
 $fp = $fp|0;
 $buffer = $buffer|0;
 $nbytes = $nbytes|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($fp)) + 32|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = $buffer;
 $3 = _emscripten_asm_const_iiii(1, ($1|0), ($2|0), ($nbytes|0))|0;
 return ($3|0);
}
function __ZL7js_seekP5hFILEii($fp,$offset,$whence) {
 $fp = $fp|0;
 $offset = $offset|0;
 $whence = $whence|0;
 var $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($fp)) + 32|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = _emscripten_asm_const_iiii(2, ($1|0), ($offset|0), ($whence|0))|0;
 return ($2|0);
}
function __ZL8js_closeP5hFILE($fp) {
 $fp = $fp|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($fp|0)==(0|0);
 if ($0) {
  return 0;
 }
 $1 = ((($fp)) + 32|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = _emscripten_asm_const_ii(3, ($2|0))|0;
 _free($fp);
 return 0;
}
function __Z12hts_hopen_jsP5hFILEPcPKc($hfile,$fn) {
 $hfile = $hfile|0;
 $fn = $fn|0;
 var $$ = 0, $$0 = 0, $$0$i = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i$i$i$i = 0, $$0$i$i$i$i$i = 0, $$0$i$i1$i = 0, $$0$i$i2$i$i = 0, $$0$i$i27$i = 0, $$0$i$i47$i = 0, $$0$i$i72 = 0, $$0$i$i74 = 0, $$0$i$i82 = 0, $$0$i2 = 0, $$0$i2$i$i = 0, $$0$i4$i$i = 0, $$0$i75 = 0, $$0$lcssa$i$i = 0, $$0$lcssa42$i$i24 = 0;
 var $$01$lcssa$i = 0, $$014$i = 0, $$02$lcssa$i$i = 0, $$02$lcssa$i$i$i = 0, $$02$lcssa$i$i$i$i = 0, $$02$lcssa$i$i$i$i$i = 0, $$02$lcssa$i$i14$i = 0, $$02$lcssa$i$i34$i = 0, $$02$lcssa$i$i59 = 0, $$0211$i$i = 0, $$0211$i$i$i = 0, $$0211$i$i$i$i = 0, $$0211$i$i$i$i$i = 0, $$0211$i$i11$i = 0, $$0211$i$i31$i = 0, $$0211$i$i56 = 0, $$03$i$i = 0, $$03$i$i$i = 0, $$03$i10$i = 0, $$03$i17$i = 0;
 var $$03$i24$i = 0, $$03$i3$i = 0, $$03$i31$i = 0, $$03$i44$i = 0, $$03$i51$i = 0, $$03$i58$i = 0, $$03$i65$i = 0, $$03$i72$i = 0, $$03$i79$i = 0, $$03$i86$i = 0, $$03$i93$i = 0, $$031$i$i = 0, $$031$i$i10 = 0, $$04$lcssa$i$i = 0, $$04$lcssa43$i$i23 = 0, $$0430$i$i = 0, $$0430$i$i11 = 0, $$06$lcssa$i$i = 0, $$06$lcssa44$i$i22 = 0, $$0629$i$i = 0;
 var $$0629$i$i12 = 0, $$1$i$i = 0, $$1$i$i$i = 0, $$1$i$i$i$i = 0, $$1$i$i$i$i$i = 0, $$1$i$i23$i = 0, $$1$i$i43$i = 0, $$1$i$i68 = 0, $$1$lcssa$i = 0, $$1$lcssa$i$i = 0, $$1$lcssa$i$i37 = 0, $$117$i$i = 0, $$117$i$i29 = 0, $$15$ph$i$i = 0, $$1511$i$i = 0, $$1511$i$i45 = 0, $$1622 = 0, $$1623 = 0, $$17$ph$i$i = 0, $$1710$i$i = 0;
 var $$1710$i$i46 = 0, $$2$ph$i$i = 0, $$212$i$i = 0, $$212$i$i44 = 0, $$28$i$i = 0, $$28$i$i51 = 0, $$3$i$i = 0, $$3$i$i52 = 0, $$cast$i$i$i = 0, $$copy$8$i$i$i = 0, $$have$10$i$i$i$ = 0, $$hold$54$i$i$i = 0, $$in$i$i$i$i = 0, $$in1$i$i$i$i = 0, $$lcssa$i$i = 0, $$not = 0, $$off = 0, $$off1635 = 0, $$phitmp$i$i = 0, $$pn$i = 0;
 var $$pn$i$i$i$i = 0, $$pn15$i = 0, $$pn3$i$i$i$i = 0, $$pre = 0, $$pre$i = 0, $$pre$phi896Z2D = 0, $$pre$phi898Z2D = 0, $$pre$phi900Z2D = 0, $$pre$phi902Z2D = 0, $$pre859 = 0, $$pre861 = 0, $$pre863 = 0, $$pre864 = 0, $$pre864$pre = 0, $$pre865 = 0, $$pre865$pre = 0, $$pre866 = 0, $$pre868 = 0, $$pre870 = 0, $$pre872 = 0;
 var $$pre874 = 0, $$pre875 = 0, $$pre876 = 0, $$pre877 = 0, $$pre879 = 0, $$pre880 = 0, $$pre882 = 0, $$pre884 = 0, $$pre885 = 0, $$pre886 = 0, $$pre887 = 0, $$pre889 = 0, $$pre892 = 0, $$pre906 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $1000 = 0, $1001 = 0;
 var $1002 = 0, $1003 = 0, $1004 = 0, $1005 = 0, $1006 = 0, $1007 = 0, $1008 = 0, $1009 = 0, $101 = 0, $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0, $1016 = 0, $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0;
 var $1020 = 0, $1021 = 0, $1022 = 0, $1023 = 0, $1024 = 0, $1025 = 0, $1026 = 0, $1027 = 0, $1028 = 0, $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0, $1034 = 0, $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0;
 var $1039 = 0, $104 = 0, $1040 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1044 = 0, $1045 = 0, $1046 = 0, $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0, $1052 = 0, $1053 = 0, $1054 = 0, $1055 = 0, $1056 = 0;
 var $1057 = 0, $1058 = 0, $1059 = 0, $106 = 0, $1060 = 0, $1061 = 0, $1062 = 0, $1063 = 0, $1064 = 0, $1065 = 0, $1066 = 0, $1067 = 0, $1068 = 0, $1069 = 0, $107 = 0, $1070 = 0, $1071 = 0, $1072 = 0, $1073 = 0, $1074 = 0;
 var $1075 = 0, $1076 = 0, $1077 = 0, $1078 = 0, $1079 = 0, $108 = 0, $1080 = 0, $1081 = 0, $1082 = 0, $1083 = 0, $1084 = 0, $1085 = 0, $1086 = 0, $1087 = 0, $1088 = 0, $1089 = 0, $109 = 0, $1090 = 0, $1091 = 0, $1092 = 0;
 var $1093 = 0, $1094 = 0, $1095 = 0, $1096 = 0, $1097 = 0, $1098 = 0, $1099 = 0, $11 = 0, $110 = 0, $1100 = 0, $1101 = 0, $1102 = 0, $1103 = 0, $1104 = 0, $1105 = 0, $1106 = 0, $1107 = 0, $1108 = 0, $1109 = 0, $111 = 0;
 var $1110 = 0, $1111 = 0, $1112 = 0, $1113 = 0, $1114 = 0, $1115 = 0, $1116 = 0, $1117 = 0, $1118 = 0, $1119 = 0, $112 = 0, $1120 = 0, $1121 = 0, $1122 = 0, $1123 = 0, $1124 = 0, $1125 = 0, $1126 = 0, $1127 = 0, $1128 = 0;
 var $1129 = 0, $113 = 0, $1130 = 0, $1131 = 0, $1132 = 0, $1133 = 0, $1134 = 0, $1135 = 0, $1136 = 0, $1137 = 0, $1138 = 0, $1139 = 0, $114 = 0, $1140 = 0, $1141 = 0, $1142 = 0, $1143 = 0, $1144 = 0, $1145 = 0, $1146 = 0;
 var $1147 = 0, $1148 = 0, $1149 = 0, $115 = 0, $1150 = 0, $1151 = 0, $1152 = 0, $1153 = 0, $1154 = 0, $1155 = 0, $1156 = 0, $1157 = 0, $1158 = 0, $1159 = 0, $116 = 0, $1160 = 0, $1161 = 0, $1162 = 0, $1163 = 0, $1164 = 0;
 var $1165 = 0, $1166 = 0, $1167 = 0, $1168 = 0, $1169 = 0, $117 = 0, $1170 = 0, $1171 = 0, $1172 = 0, $1173 = 0, $1174 = 0, $1175 = 0, $1176 = 0, $1177 = 0, $1178 = 0, $1179 = 0, $118 = 0, $1180 = 0, $1181 = 0, $1182 = 0;
 var $1183 = 0, $1184 = 0, $1185 = 0, $1186 = 0, $1187 = 0, $1188 = 0, $1189 = 0, $119 = 0, $1190 = 0, $1191 = 0, $1192 = 0, $1193 = 0, $1194 = 0, $1195 = 0, $1196 = 0, $1197 = 0, $1198 = 0, $1199 = 0, $12 = 0, $120 = 0;
 var $1200 = 0, $1201 = 0, $1202 = 0, $1203 = 0, $1204 = 0, $1205 = 0, $1206 = 0, $1207 = 0, $1208 = 0, $1209 = 0, $121 = 0, $1210 = 0, $1211 = 0, $1212 = 0, $1213 = 0, $1214 = 0, $1215 = 0, $1216 = 0, $1217 = 0, $1218 = 0;
 var $1219 = 0, $122 = 0, $1220 = 0, $1221 = 0, $1222 = 0, $1223 = 0, $1224 = 0, $1225 = 0, $1226 = 0, $1227 = 0, $1228 = 0, $1229 = 0, $123 = 0, $1230 = 0, $1231 = 0, $1232 = 0, $1233 = 0, $1234 = 0, $1235 = 0, $1236 = 0;
 var $1237 = 0, $1238 = 0, $1239 = 0, $124 = 0, $1240 = 0, $1241 = 0, $1242 = 0, $1243 = 0, $1244 = 0, $1245 = 0, $1246 = 0, $1247 = 0, $1248 = 0, $1249 = 0, $125 = 0, $1250 = 0, $1251 = 0, $1252 = 0, $1253 = 0, $1254 = 0;
 var $1255 = 0, $1256 = 0, $1257 = 0, $1258 = 0, $1259 = 0, $126 = 0, $1260 = 0, $1261 = 0, $1262 = 0, $1263 = 0, $1264 = 0, $1265 = 0, $1266 = 0, $1267 = 0, $1268 = 0, $1269 = 0, $127 = 0, $1270 = 0, $1271 = 0, $1272 = 0;
 var $1273 = 0, $1274 = 0, $1275 = 0, $1276 = 0, $1277 = 0, $1278 = 0, $1279 = 0, $128 = 0, $1280 = 0, $1281 = 0, $1282 = 0, $1283 = 0, $1284 = 0, $1285 = 0, $1286 = 0, $1287 = 0, $1288 = 0, $1289 = 0, $129 = 0, $1290 = 0;
 var $1291 = 0, $1292 = 0, $1293 = 0, $1294 = 0, $1295 = 0, $1296 = 0, $1297 = 0, $1298 = 0, $1299 = 0, $13 = 0, $130 = 0, $1300 = 0, $1301 = 0, $1302 = 0, $1303 = 0, $1304 = 0, $1305 = 0, $1306 = 0, $1307 = 0, $1308 = 0;
 var $1309 = 0, $131 = 0, $1310 = 0, $1311 = 0, $1312 = 0, $1313 = 0, $1314 = 0, $1315 = 0, $1316 = 0, $1317 = 0, $1318 = 0, $1319 = 0, $132 = 0, $1320 = 0, $1321 = 0, $1322 = 0, $1323 = 0, $1324 = 0, $1325 = 0, $1326 = 0;
 var $1327 = 0, $1328 = 0, $1329 = 0, $133 = 0, $1330 = 0, $1331 = 0, $1332 = 0, $1333 = 0, $1334 = 0, $1335 = 0, $1336 = 0, $1337 = 0, $1338 = 0, $1339 = 0, $134 = 0, $1340 = 0, $1341 = 0, $1342 = 0, $1343 = 0, $1344 = 0;
 var $1345 = 0, $1346 = 0, $1347 = 0, $1348 = 0, $1349 = 0, $135 = 0, $1350 = 0, $1351 = 0, $1352 = 0, $1353 = 0, $1354 = 0, $1355 = 0, $1356 = 0, $1357 = 0, $1358 = 0, $1359 = 0, $136 = 0, $1360 = 0, $1361 = 0, $1362 = 0;
 var $1363 = 0, $1364 = 0, $1365 = 0, $1366 = 0, $1367 = 0, $1368 = 0, $1369 = 0, $137 = 0, $1370 = 0, $1371 = 0, $1372 = 0, $1373 = 0, $1374 = 0, $1375 = 0, $1376 = 0, $1377 = 0, $1378 = 0, $1379 = 0, $138 = 0, $1380 = 0;
 var $1381 = 0, $1382 = 0, $1383 = 0, $1384 = 0, $1385 = 0, $1386 = 0, $1387 = 0, $1388 = 0, $1389 = 0, $139 = 0, $1390 = 0, $1391 = 0, $1392 = 0, $1393 = 0, $1394 = 0, $1395 = 0, $1396 = 0, $1397 = 0, $1398 = 0, $1399 = 0;
 var $14 = 0, $140 = 0, $1400 = 0, $1401 = 0, $1402 = 0, $1403 = 0, $1404 = 0, $1405 = 0, $1406 = 0, $1407 = 0, $1408 = 0, $1409 = 0, $141 = 0, $1410 = 0, $1411 = 0, $1412 = 0, $1413 = 0, $1414 = 0, $1415 = 0, $1416 = 0;
 var $1417 = 0, $1418 = 0, $1419 = 0, $142 = 0, $1420 = 0, $1421 = 0, $1422 = 0, $1423 = 0, $1424 = 0, $1425 = 0, $1426 = 0, $1427 = 0, $1428 = 0, $1429 = 0, $143 = 0, $1430 = 0, $1431 = 0, $1432 = 0, $1433 = 0, $1434 = 0;
 var $1435 = 0, $1436 = 0, $1437 = 0, $1438 = 0, $1439 = 0, $144 = 0, $1440 = 0, $1441 = 0, $1442 = 0, $1443 = 0, $1444 = 0, $1445 = 0, $1446 = 0, $1447 = 0, $1448 = 0, $1449 = 0, $145 = 0, $1450 = 0, $1451 = 0, $1452 = 0;
 var $1453 = 0, $1454 = 0, $1455 = 0, $1456 = 0, $1457 = 0, $1458 = 0, $1459 = 0, $146 = 0, $1460 = 0, $1461 = 0, $1462 = 0, $1463 = 0, $1464 = 0, $1465 = 0, $1466 = 0, $1467 = 0, $1468 = 0, $1469 = 0, $147 = 0, $1470 = 0;
 var $1471 = 0, $1472 = 0, $1473 = 0, $1474 = 0, $1475 = 0, $1476 = 0, $1477 = 0, $1478 = 0, $1479 = 0, $148 = 0, $1480 = 0, $1481 = 0, $1482 = 0, $1483 = 0, $1484 = 0, $1485 = 0, $1486 = 0, $1487 = 0, $1488 = 0, $1489 = 0;
 var $149 = 0, $1490 = 0, $1491 = 0, $1492 = 0, $1493 = 0, $1494 = 0, $1495 = 0, $1496 = 0, $1497 = 0, $1498 = 0, $1499 = 0, $15 = 0, $150 = 0, $1500 = 0, $1501 = 0, $1502 = 0, $1503 = 0, $1504 = 0, $1505 = 0, $1506 = 0;
 var $1507 = 0, $1508 = 0, $1509 = 0, $151 = 0, $1510 = 0, $1511 = 0, $1512 = 0, $1513 = 0, $1514 = 0, $1515 = 0, $1516 = 0, $1517 = 0, $1518 = 0, $1519 = 0, $152 = 0, $1520 = 0, $1521 = 0, $1522 = 0, $1523 = 0, $1524 = 0;
 var $1525 = 0, $1526 = 0, $1527 = 0, $1528 = 0, $1529 = 0, $153 = 0, $1530 = 0, $1531 = 0, $1532 = 0, $1533 = 0, $1534 = 0, $1535 = 0, $1536 = 0, $1537 = 0, $1538 = 0, $1539 = 0, $154 = 0, $1540 = 0, $1541 = 0, $1542 = 0;
 var $1543 = 0, $1544 = 0, $1545 = 0, $1546 = 0, $1547 = 0, $1548 = 0, $1549 = 0, $155 = 0, $1550 = 0, $1551 = 0, $1552 = 0, $1553 = 0, $1554 = 0, $1555 = 0, $1556 = 0, $1557 = 0, $1558 = 0, $1559 = 0, $156 = 0, $1560 = 0;
 var $1561 = 0, $1562 = 0, $1563 = 0, $1564 = 0, $1565 = 0, $1566 = 0, $1567 = 0, $1568 = 0, $1569 = 0, $157 = 0, $1570 = 0, $1571 = 0, $1572 = 0, $1573 = 0, $1574 = 0, $1575 = 0, $1576 = 0, $1577 = 0, $1578 = 0, $1579 = 0;
 var $158 = 0, $1580 = 0, $1581 = 0, $1582 = 0, $1583 = 0, $1584 = 0, $1585 = 0, $1586 = 0, $1587 = 0, $1588 = 0, $1589 = 0, $159 = 0, $1590 = 0, $1591 = 0, $1592 = 0, $1593 = 0, $1594 = 0, $1595 = 0, $1596 = 0, $1597 = 0;
 var $1598 = 0, $1599 = 0, $16 = 0, $160 = 0, $1600 = 0, $1601 = 0, $1602 = 0, $1603 = 0, $1604 = 0, $1605 = 0, $1606 = 0, $1607 = 0, $1608 = 0, $1609 = 0, $161 = 0, $1610 = 0, $1611 = 0, $1612 = 0, $1613 = 0, $1614 = 0;
 var $1615 = 0, $1616 = 0, $1617 = 0, $1618 = 0, $1619 = 0, $162 = 0, $1620 = 0, $1621 = 0, $1622 = 0, $1623 = 0, $1624 = 0, $1625 = 0, $1626 = 0, $1627 = 0, $1628 = 0, $1629 = 0, $163 = 0, $1630 = 0, $1631 = 0, $1632 = 0;
 var $1633 = 0, $1634 = 0, $1635 = 0, $1636 = 0, $1637 = 0, $1638 = 0, $1639 = 0, $164 = 0, $1640 = 0, $1641 = 0, $1642 = 0, $1643 = 0, $1644 = 0, $1645 = 0, $1646 = 0, $1647 = 0, $1648 = 0, $1649 = 0, $165 = 0, $1650 = 0;
 var $1651 = 0, $1652 = 0, $1653 = 0, $1654 = 0, $1655 = 0, $1656 = 0, $1657 = 0, $1658 = 0, $1659 = 0, $166 = 0, $1660 = 0, $1661 = 0, $1662 = 0, $1663 = 0, $1664 = 0, $1665 = 0, $1666 = 0, $1667 = 0, $1668 = 0, $1669 = 0;
 var $167 = 0, $1670 = 0, $1671 = 0, $1672 = 0, $1673 = 0, $1674 = 0, $1675 = 0, $1676 = 0, $1677 = 0, $1678 = 0, $1679 = 0, $168 = 0, $1680 = 0, $1681 = 0, $1682 = 0, $1683 = 0, $1684 = 0, $1685 = 0, $1686 = 0, $1687 = 0;
 var $1688 = 0, $1689 = 0, $169 = 0, $1690 = 0, $1691 = 0, $1692 = 0, $1693 = 0, $1694 = 0, $1695 = 0, $1696 = 0, $1697 = 0, $1698 = 0, $1699 = 0, $17 = 0, $170 = 0, $1700 = 0, $1701 = 0, $1702 = 0, $1703 = 0, $1704 = 0;
 var $1705 = 0, $1706 = 0, $1707 = 0, $1708 = 0, $1709 = 0, $171 = 0, $1710 = 0, $1711 = 0, $1712 = 0, $1713 = 0, $1714 = 0, $1715 = 0, $1716 = 0, $1717 = 0, $1718 = 0, $1719 = 0, $172 = 0, $1720 = 0, $1721 = 0, $1722 = 0;
 var $1723 = 0, $1724 = 0, $1725 = 0, $1726 = 0, $1727 = 0, $1728 = 0, $1729 = 0, $173 = 0, $1730 = 0, $1731 = 0, $1732 = 0, $1733 = 0, $1734 = 0, $1735 = 0, $1736 = 0, $1737 = 0, $1738 = 0, $1739 = 0, $174 = 0, $1740 = 0;
 var $1741 = 0, $1742 = 0, $1743 = 0, $1744 = 0, $1745 = 0, $1746 = 0, $1747 = 0, $1748 = 0, $1749 = 0, $175 = 0, $1750 = 0, $1751 = 0, $1752 = 0, $1753 = 0, $1754 = 0, $1755 = 0, $1756 = 0, $1757 = 0, $1758 = 0, $1759 = 0;
 var $176 = 0, $1760 = 0, $1761 = 0, $1762 = 0, $1763 = 0, $1764 = 0, $1765 = 0, $1766 = 0, $1767 = 0, $1768 = 0, $1769 = 0, $177 = 0, $1770 = 0, $1771 = 0, $1772 = 0, $1773 = 0, $1774 = 0, $1775 = 0, $1776 = 0, $1777 = 0;
 var $1778 = 0, $1779 = 0, $178 = 0, $1780 = 0, $1781 = 0, $1782 = 0, $1783 = 0, $1784 = 0, $1785 = 0, $1786 = 0, $1787 = 0, $1788 = 0, $1789 = 0, $179 = 0, $1790 = 0, $1791 = 0, $1792 = 0, $1793 = 0, $1794 = 0, $1795 = 0;
 var $1796 = 0, $1797 = 0, $1798 = 0, $1799 = 0, $18 = 0, $180 = 0, $1800 = 0, $1801 = 0, $1802 = 0, $1803 = 0, $1804 = 0, $1805 = 0, $1806 = 0, $1807 = 0, $1808 = 0, $1809 = 0, $181 = 0, $1810 = 0, $1811 = 0, $1812 = 0;
 var $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0;
 var $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0;
 var $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0;
 var $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0;
 var $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0;
 var $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0;
 var $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0;
 var $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0;
 var $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0;
 var $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0;
 var $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0;
 var $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0;
 var $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0;
 var $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0;
 var $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0;
 var $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0;
 var $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0;
 var $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0;
 var $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0;
 var $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0;
 var $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0;
 var $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0;
 var $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0;
 var $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0;
 var $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0;
 var $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0;
 var $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0;
 var $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0;
 var $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0;
 var $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0;
 var $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0;
 var $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0;
 var $759 = 0, $76 = 0, $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0;
 var $777 = 0, $778 = 0, $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0;
 var $795 = 0, $796 = 0, $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0;
 var $812 = 0, $813 = 0, $814 = 0, $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0, $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0;
 var $830 = 0, $831 = 0, $832 = 0, $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0, $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0;
 var $849 = 0, $85 = 0, $850 = 0, $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0, $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0;
 var $867 = 0, $868 = 0, $869 = 0, $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0, $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0;
 var $885 = 0, $886 = 0, $887 = 0, $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0, $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0;
 var $902 = 0, $903 = 0, $904 = 0, $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0, $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0;
 var $920 = 0, $921 = 0, $922 = 0, $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0, $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0;
 var $939 = 0, $94 = 0, $940 = 0, $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0, $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0;
 var $957 = 0, $958 = 0, $959 = 0, $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0, $970 = 0, $971 = 0, $972 = 0, $973 = 0, $974 = 0;
 var $975 = 0, $976 = 0, $977 = 0, $978 = 0, $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0, $983 = 0, $984 = 0, $985 = 0, $986 = 0, $987 = 0, $988 = 0, $989 = 0, $99 = 0, $990 = 0, $991 = 0, $992 = 0;
 var $993 = 0, $994 = 0, $995 = 0, $996 = 0, $997 = 0, $998 = 0, $999 = 0, $bits$0$i$i$i = 0, $bits$0$i$i$i$be = 0, $bits$0$i$i$i$i = 0, $bits$1$i$i$i = 0, $bits$1$i$i$i$i = 0, $bits$10$i$i$i = 0, $bits$10$i$i$i$i = 0, $bits$11$i$i$i = 0, $bits$12$i$i$i = 0, $bits$13$i$i$i = 0, $bits$14$i$i$i = 0, $bits$15$i$i$i = 0, $bits$16$i$i$i = 0;
 var $bits$17$i$i$i = 0, $bits$19$i$i$i = 0, $bits$2$i$i$i = 0, $bits$2$i$i$i$i = 0, $bits$20$i$i$i = 0, $bits$21$i$i$i = 0, $bits$22$i$i$i = 0, $bits$23$i$i$i = 0, $bits$24$i$i$i = 0, $bits$26$i$i$i = 0, $bits$26$i$i$i$ph = 0, $bits$27$i$i$i = 0, $bits$28$i$i$i = 0, $bits$29$i$i$i = 0, $bits$3$i$i$i$i = 0, $bits$30$i$i$i = 0, $bits$31$i$i$i = 0, $bits$32$i$i$i = 0, $bits$33$i$i$i = 0, $bits$35$i$i$i = 0;
 var $bits$38$i$i$i = 0, $bits$39$i$i$i = 0, $bits$4$i$i$i = 0, $bits$4$i$i$i$i = 0, $bits$40$i$i$i = 0, $bits$41$i$i$i = 0, $bits$42$i$i$i = 0, $bits$43$i$i$i = 0, $bits$44$i$i$i = 0, $bits$45$i$i$i = 0, $bits$46$i$i$i = 0, $bits$47$i$i$i = 0, $bits$48$i$i$i = 0, $bits$49$i$i$i = 0, $bits$5$i$i$i$i = 0, $bits$50$i$i$i = 0, $bits$51$i$i$i = 0, $bits$52$i$i$i = 0, $bits$53$i$i$i = 0, $bits$54$i$i$i = 0;
 var $bits$55$i$i$i = 0, $bits$56$i$i$i = 0, $bits$57$i$i$i = 0, $bits$58$i$i$i = 0, $bits$6$i$i$i = 0, $bits$6$i$i$i$i = 0, $bits$61$i$i$i = 0, $bits$61$i$i$i$ph = 0, $bits$7$i$i$i = 0, $bits$8$i$i$i = 0, $bits$8$i$i$i$i = 0, $bits$9$i$i$i = 0, $bits$9$i$i$i$i = 0, $buffer$i$i = 0, $compress_level$0$i$i$i = 0, $copy$1$i$i$i = 0, $copy$10$i$i$i = 0, $copy$12$i$i$i = 0, $copy$2$i$i$i = 0, $copy$4$i$i$i = 0;
 var $copy$6$i$i$i = 0, $copy$7$i$i$i = 0, $copy$8$i$i$i = 0, $fp$0$i = 0, $from$0$i$i$i = 0, $from$0$i$i$i$i = 0, $from$1$i$i$i = 0, $from$10$i$i$i$i = 0, $from$11$i$i$i$i = 0, $from$2$i$i$i = 0, $from$2$i$i$i$i = 0, $from$3$i$i$i$i = 0, $from$6$i$i$i$i = 0, $have$0$i$i$i = 0, $have$0$i$i$i$be = 0, $have$1$i$i$i = 0, $have$10$i$i$i = 0, $have$10$i$i$i$ = 0, $have$11$i$i$i = 0, $have$12$i$i$i = 0;
 var $have$13$i$i$i = 0, $have$14$i$i$i = 0, $have$15$i$i$i = 0, $have$16$i$i$i = 0, $have$17$i$i$i = 0, $have$18$i$i$i = 0, $have$19$i$i$i = 0, $have$2$i$i$i = 0, $have$20$i$i$i = 0, $have$21$i$i$i = 0, $have$23$i$i$i = 0, $have$24$i$i$i = 0, $have$25$i$i$i = 0, $have$26$i$i$i = 0, $have$27$i$i$i = 0, $have$27$i$i$i$ = 0, $have$28$i$i$i = 0, $have$30$i$i$i = 0, $have$30$i$i$i$ph = 0, $have$31$i$i$i = 0;
 var $have$32$i$i$i = 0, $have$33$i$i$i = 0, $have$34$i$i$i = 0, $have$35$i$i$i = 0, $have$36$i$i$i = 0, $have$37$i$i$i = 0, $have$39$i$i$i = 0, $have$4$i$i$i = 0, $have$42$i$i$i = 0, $have$43$i$i$i = 0, $have$44$i$i$i = 0, $have$45$i$i$i = 0, $have$46$i$i$i = 0, $have$47$i$i$i = 0, $have$48$i$i$i = 0, $have$49$i$i$i = 0, $have$50$i$i$i = 0, $have$51$i$i$i = 0, $have$52$i$i$i = 0, $have$53$i$i$i = 0;
 var $have$54$i$i$i = 0, $have$55$i$i$i = 0, $have$56$i$i$i = 0, $have$57$i$i$i = 0, $have$58$i$i$i = 0, $have$59$i$i$i = 0, $have$6$i$i$i = 0, $have$60$i$i$i = 0, $have$61$i$i$i = 0, $have$62$i$i$i = 0, $have$65$i$i$i = 0, $have$65$i$i$i$ph = 0, $have$7$i$i$i = 0, $have$8$i$i$i = 0, $have$9$i$i$i = 0, $hbuf$i$i$i = 0, $here$i$i$i$sroa$0$0 = 0, $here$i$i$i$sroa$0$1 = 0, $here$i$i$i$sroa$18$0 = 0, $here$i$i$i$sroa$18$1 = 0;
 var $here$i$i$i$sroa$32$0 = 0, $here$i$i$i$sroa$32$1 = 0, $here$i$i$i$sroa$32$1$in = 0, $hold$0$i$i$i = 0, $hold$0$i$i$i$be = 0, $hold$0$i$i$i$i = 0, $hold$1$i$i$i = 0, $hold$1$i$i$i$i = 0, $hold$10$i$i$i = 0, $hold$10$i$i$i$i = 0, $hold$11$i$i$i = 0, $hold$12$i$i$i = 0, $hold$13$i$i$i = 0, $hold$14$i$i$i = 0, $hold$15$i$i$i = 0, $hold$16$i$i$i = 0, $hold$17$i$i$i = 0, $hold$19$i$i$i = 0, $hold$2$i$i$i$i = 0, $hold$20$i$i$i = 0;
 var $hold$21$i$i$i = 0, $hold$22$i$i$i = 0, $hold$23$i$i$i = 0, $hold$24$i$i$i = 0, $hold$26$i$i$i = 0, $hold$26$i$i$i$ph = 0, $hold$27$i$i$i = 0, $hold$28$i$i$i = 0, $hold$29$i$i$i = 0, $hold$3$i$i$i$i = 0, $hold$30$i$i$i = 0, $hold$31$i$i$i = 0, $hold$32$i$i$i = 0, $hold$33$i$i$i = 0, $hold$35$i$i$i = 0, $hold$38$i$i$i = 0, $hold$39$i$i$i = 0, $hold$4$i$i$i = 0, $hold$4$i$i$i$i = 0, $hold$40$i$i$i = 0;
 var $hold$41$i$i$i = 0, $hold$42$i$i$i = 0, $hold$43$i$i$i = 0, $hold$44$i$i$i = 0, $hold$45$i$i$i = 0, $hold$46$i$i$i = 0, $hold$47$i$i$i = 0, $hold$48$i$i$i = 0, $hold$49$i$i$i = 0, $hold$5$i$i$i$i = 0, $hold$50$i$i$i = 0, $hold$51$i$i$i = 0, $hold$52$i$i$i = 0, $hold$53$i$i$i = 0, $hold$54$i$i$i = 0, $hold$55$i$i$i = 0, $hold$56$i$i$i = 0, $hold$57$i$i$i = 0, $hold$58$i$i$i = 0, $hold$6$i$i$i = 0;
 var $hold$6$i$i$i$i = 0, $hold$61$i$i$i = 0, $hold$61$i$i$i$ph = 0, $hold$7$i$i$i = 0, $hold$8$i$i$i = 0, $hold$8$i$i$i$i = 0, $hold$9$i$i$i = 0, $hold$9$i$i$i$i = 0, $i$0$i$i$i = 0, $i$03$i$i$i = 0, $i$03$i$i$i$i = 0, $i$12$i$i$i = 0, $i$12$i$i$i$i = 0, $in$0$i$i$i$i = 0, $in$1$i$i$i$i = 0, $in$2$i$i$i$i = 0, $in$3$i$i$i$i = 0, $in$4$i$i$i$i = 0, $in$6$i$i$i$i = 0, $in$7$i$i$i$i = 0;
 var $in$8$i$i$i$i = 0, $l$04$i$i = 0, $l$04$i$i$i = 0, $l$04$i16$i = 0, $l$04$i2$i = 0, $l$04$i23$i = 0, $l$04$i30$i = 0, $l$04$i43$i = 0, $l$04$i50$i = 0, $l$04$i57$i = 0, $l$04$i64$i = 0, $l$04$i71$i = 0, $l$04$i78$i = 0, $l$04$i85$i = 0, $l$04$i9$i = 0, $l$04$i92$i = 0, $left$0$i$i$i = 0, $left$0$i$i$i$be = 0, $left$0$i$i$i$copy$10$i$i$i = 0, $left$0$i$i$i$lcssa660 = 0;
 var $left$0$i$i$i688 = 0, $len$0$i = 0, $len$0$i$i$i$i = 0, $len$1$i$i$i = 0, $len$7$i$i$i$i = 0, $len$8$i$i$i$i = 0, $magic$i$i = 0, $next$0$i$i$i = 0, $next$0$i$i$i$be = 0, $next$1$i$i$i = 0, $next$10$i$i$i = 0, $next$11$i$i$i = 0, $next$12$i$i$i = 0, $next$13$i$i$i = 0, $next$14$i$i$i = 0, $next$15$i$i$i = 0, $next$16$i$i$i = 0, $next$17$i$i$i = 0, $next$18$i$i$i = 0, $next$19$i$i$i = 0;
 var $next$2$i$i$i = 0, $next$20$i$i$i = 0, $next$21$i$i$i = 0, $next$23$i$i$i = 0, $next$24$i$i$i = 0, $next$25$i$i$i = 0, $next$26$i$i$i = 0, $next$27$i$i$i = 0, $next$28$i$i$i = 0, $next$30$i$i$i = 0, $next$30$i$i$i$ph = 0, $next$31$i$i$i = 0, $next$32$i$i$i = 0, $next$33$i$i$i = 0, $next$34$i$i$i = 0, $next$35$i$i$i = 0, $next$36$i$i$i = 0, $next$37$i$i$i = 0, $next$39$i$i$i = 0, $next$4$i$i$i = 0;
 var $next$42$i$i$i = 0, $next$43$i$i$i = 0, $next$44$i$i$i = 0, $next$45$i$i$i = 0, $next$46$i$i$i = 0, $next$47$i$i$i = 0, $next$48$i$i$i = 0, $next$49$i$i$i = 0, $next$50$i$i$i = 0, $next$51$i$i$i = 0, $next$52$i$i$i = 0, $next$53$i$i$i = 0, $next$54$i$i$i = 0, $next$55$i$i$i = 0, $next$56$i$i$i = 0, $next$57$i$i$i = 0, $next$58$i$i$i = 0, $next$59$i$i$i = 0, $next$6$i$i$i = 0, $next$60$i$i$i = 0;
 var $next$61$i$i$i = 0, $next$62$i$i$i = 0, $next$65$i$i$i = 0, $next$65$i$i$i$ph = 0, $next$7$i$i$i = 0, $next$8$i$i$i = 0, $next$9$i$i$i = 0, $not$ = 0, $not$84 = 0, $not$85 = 0, $not$86 = 0, $not$88 = 0, $not$89 = 0, $notlhs = 0, $notrhs = 0, $op$0$i$i$i$i = 0, $op$1$i$i$i$i = 0, $op$2$i$i$i$i = 0, $op$3$i$i$i$i = 0, $or$cond = 0;
 var $or$cond$i$i3 = 0, $or$cond142 = 0, $or$cond1616 = 0, $or$cond1617 = 0, $or$cond1618 = 0, $or$cond1619 = 0, $or$cond1620 = 0, $or$cond1621 = 0, $or$cond1624 = 0, $or$cond1625 = 0, $or$cond1631 = 0, $or$cond1633 = 0, $or$cond1634 = 0, $or$cond28$i$i = 0, $out$0$i$i$i = 0, $out$0$i$i$i$be = 0, $out$0$i$i$i$i = 0, $out$1$i$i$i = 0, $out$1$i$i$i$i = 0, $out$11$i$i$i$i = 0;
 var $out$14$i$i$i$i = 0, $out$18$i$i$i$i = 0, $out$19$i$i$i$i = 0, $out$2$i$i$i = 0, $out$3$i$i$i$i = 0, $out$4$i$i$i$i = 0, $out$5$i$i$i = 0, $out$7$i$i$i$i = 0, $phitmp = 0, $phitmp$i = 0, $phitmp$i$ = 0, $phitmp$i$i = 0, $put$0$i$i$i = 0, $put$0$i$i$i$be = 0, $put$1$i$i$i = 0, $r$05$i$i = 0, $r$05$i$i$i = 0, $r$05$i1$i = 0, $r$05$i15$i = 0, $r$05$i22$i = 0;
 var $r$05$i29$i = 0, $r$05$i42$i = 0, $r$05$i49$i = 0, $r$05$i56$i = 0, $r$05$i63$i = 0, $r$05$i70$i = 0, $r$05$i77$i = 0, $r$05$i8$i = 0, $r$05$i84$i = 0, $r$05$i91$i = 0, $ret$0$i$i$i = 0, $ret$0$i$i$i$be = 0, $ret$1$i$i$i = 0, $ret$2$i$i$i = 0, $ret$3$i$i$i = 0, $ret$4$i$i$i = 0, $ret$5$i$i$i = 0, $ret$6$i$i$i = 0, $ret$7$i$i$i = 0, $ret$9$i$i$i = 0;
 var $ret$9$i$i$i$ph = 0, $s$0$i$i = 0, $s$0$i36$i = 0, $s$0$lcssa$i$i$i = 0, $s$0$pn$i$i = 0, $s$0$pn$i38$i = 0, $s$01$i$i$i = 0, $s$01$i$i$i$i = 0, $s$1$i$i = 0, $s$1$i$i$i = 0, $s$1$i$i$i$i = 0, $s$1$i40$i = 0, $s$i = 0, $scevgep = 0, $scevgep1606 = 0, $scevgep1607 = 0, $scevgep1608 = 0, $scevgep1609 = 0, $scevgep1610 = 0, $scevgep1611 = 0;
 var $scevgep1612 = 0, $simple_mode = 0, $storemerge = 0, $storemerge$i$i$i$i = 0, $storemerge$in$in$i$i$i$i = 0, $storemerge2$i$i$i$i = 0, $storemerge2$in$in$i$i$i$i = 0, $v$0$i$i = 0, $v$0$i37$i = 0, $v$1$i$i = 0, $v$1$i39$i = 0, $vararg_buffer = 0, $vararg_buffer13 = 0, $vararg_buffer17 = 0, $vararg_buffer2 = 0, $vararg_buffer21 = 0, $vararg_buffer6 = 0, $vararg_buffer9 = 0, $vararg_ptr1 = 0, $vararg_ptr12 = 0;
 var $vararg_ptr16 = 0, $vararg_ptr20 = 0, $vararg_ptr24 = 0, $vararg_ptr5 = 0, $w$0$i = 0, $w$0$lcssa$i$i = 0, $w$0$lcssa$i$i$i = 0, $w$0$lcssa$i$i$i$i = 0, $w$0$lcssa$i$i$i$i$i = 0, $w$0$lcssa$i$i21$i = 0, $w$0$lcssa$i$i41$i = 0, $w$0$lcssa$i$i66 = 0, $w$08$i$i = 0, $w$08$i$i$i = 0, $w$08$i$i$i$i = 0, $w$08$i$i$i$i$i = 0, $w$08$i$i17$i = 0, $w$08$i$i37$i = 0, $w$08$i$i62 = 0, $wd$0$lcssa$i$i = 0;
 var $wd$0$lcssa$i$i36 = 0, $wd$018$i$i = 0, $wd$018$i$i28 = 0, $ws$0$lcssa$i$i = 0, $ws$0$lcssa$i$i35 = 0, $ws$019$i$i = 0, $ws$019$i$i27 = 0, $zs$i$i$sroa$0$0 = 0, $zs$i$i$sroa$0$1 = 0, $zs$i$i$sroa$0$1$be = 0, $zs$i$i$sroa$0$2 = 0, $zs$i$i$sroa$11$0 = 0, $zs$i$i$sroa$11$1 = 0, $zs$i$i$sroa$11$1$be = 0, $zs$i$i$sroa$11$2 = 0, $zs$i$i$sroa$24$0 = 0, $zs$i$i$sroa$24$1 = 0, $zs$i$i$sroa$24$1$be = 0, $zs$i$i$sroa$24$2 = 0, $zs$i$i$sroa$36$0 = 0;
 var $zs$i$i$sroa$36$1 = 0, $zs$i$i$sroa$36$1$be = 0, $zs$i$i$sroa$36$2 = 0, $zs$i$i$sroa$47$0 = 0, $zs$i$i$sroa$47$1 = 0, $zs$i$i$sroa$47$1$be = 0, $zs$i$i$sroa$47$2 = 0, $zs$i$i$sroa$47$3 = 0, $zs$i$i$sroa$47$4 = 0, $zs$i$i$sroa$47$5 = 0, $zs$i$i$sroa$47$5$ph = 0, $zs$i$i$sroa$47$6 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 720|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer21 = sp + 48|0;
 $vararg_buffer17 = sp + 40|0;
 $vararg_buffer13 = sp + 32|0;
 $vararg_buffer9 = sp + 24|0;
 $vararg_buffer6 = sp + 16|0;
 $vararg_buffer2 = sp + 8|0;
 $vararg_buffer = sp;
 $hbuf$i$i$i = sp + 712|0;
 $buffer$i$i = sp + 200|0;
 $s$i = sp + 176|0;
 $magic$i$i = sp + 158|0;
 $simple_mode = sp + 56|0;
 $0 = (_malloc(64)|0);
 $1 = ($0|0)==(0|0);
 if ($1) {
  $6 = ((($simple_mode)) + 100|0);
  HEAP8[$6>>0] = 0;
  HEAP32[$vararg_buffer>>2] = 13455;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = $fn;
  _printf(13423,$vararg_buffer);
  $$0 = 0;
  STACKTOP = sp;return ($$0|0);
 }
 $2 = ((($0)) + -4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = $3 & 3;
 $5 = ($4|0)==(0);
 if (!($5)) {
  dest=$0; stop=dest+64|0; do { HEAP8[dest>>0]=0|0; dest=dest+1|0; } while ((dest|0) < (stop|0));
 }
 $7 = ((($simple_mode)) + 100|0);
 HEAP8[$7>>0] = 0;
 $8 = $fn;
 $9 = $8 & 3;
 $10 = ($9|0)==(0);
 L8: do {
  if ($10) {
   $$01$lcssa$i = $fn;
   label = 8;
  } else {
   $$014$i = $fn;$1809 = $8;
   while(1) {
    $11 = HEAP8[$$014$i>>0]|0;
    $12 = ($11<<24>>24)==(0);
    if ($12) {
     $$pn$i = $1809;
     break L8;
    }
    $13 = ((($$014$i)) + 1|0);
    $14 = $13;
    $15 = $14 & 3;
    $16 = ($15|0)==(0);
    if ($16) {
     $$01$lcssa$i = $13;
     label = 8;
     break;
    } else {
     $$014$i = $13;$1809 = $14;
    }
   }
  }
 } while(0);
 if ((label|0) == 8) {
  $w$0$i = $$01$lcssa$i;
  while(1) {
   $17 = HEAP32[$w$0$i>>2]|0;
   $18 = (($17) + -16843009)|0;
   $19 = $17 & -2139062144;
   $20 = $19 ^ -2139062144;
   $21 = $20 & $18;
   $22 = ($21|0)==(0);
   $23 = ((($w$0$i)) + 4|0);
   if ($22) {
    $w$0$i = $23;
   } else {
    break;
   }
  }
  $24 = $17&255;
  $25 = ($24<<24>>24)==(0);
  if ($25) {
   $$1$lcssa$i = $w$0$i;
  } else {
   $$pn15$i = $w$0$i;
   while(1) {
    $26 = ((($$pn15$i)) + 1|0);
    $$pre$i = HEAP8[$26>>0]|0;
    $27 = ($$pre$i<<24>>24)==(0);
    if ($27) {
     $$1$lcssa$i = $26;
     break;
    } else {
     $$pn15$i = $26;
    }
   }
  }
  $28 = $$1$lcssa$i;
  $$pn$i = $28;
 }
 $$0$i2 = (($$pn$i) - ($8))|0;
 $29 = (($$0$i2) + 1)|0;
 $30 = (_malloc($29)|0);
 $31 = ($30|0)==(0|0);
 if ($31) {
  $$0$i = 0;
 } else {
  _memcpy(($30|0),($fn|0),($29|0))|0;
  $$0$i = $30;
 }
 $32 = ((($0)) + 28|0);
 HEAP32[$32>>2] = $$0$i;
 $33 = HEAP32[$0>>2]|0;
 $34 = $33 & -5;
 HEAP32[$0>>2] = $34;
 L25: do {
  if (((((13322) & 3)|0)==(0))) {
   $$02$lcssa$i$i = 13322;
   label = 18;
  } else {
   $$0211$i$i = 13322;
   while(1) {
    $35 = HEAP8[$$0211$i$i>>0]|0;
    switch ($35<<24>>24) {
    case 0: case 44:  {
     $$0$i$i = $$0211$i$i;$63 = $35;
     break L25;
     break;
    }
    default: {
    }
    }
    $36 = ((($$0211$i$i)) + 1|0);
    $37 = $36;
    $38 = $37 & 3;
    $39 = ($38|0)==(0);
    if ($39) {
     $$02$lcssa$i$i = $36;
     label = 18;
     break L25;
    } else {
     $$0211$i$i = $36;
    }
   }
  }
 } while(0);
 L29: do {
  if ((label|0) == 18) {
   $40 = HEAP32[$$02$lcssa$i$i>>2]|0;
   $41 = (($40) + -16843009)|0;
   $42 = $40 & -2139062144;
   $43 = $42 ^ -2139062144;
   $44 = $43 & $41;
   $45 = ($44|0)==(0);
   L31: do {
    if ($45) {
     $47 = $40;$w$08$i$i = $$02$lcssa$i$i;
     while(1) {
      $46 = $47 ^ 741092396;
      $48 = (($46) + -16843009)|0;
      $49 = $47 & -2139062144;
      $50 = $49 ^ -2139062144;
      $51 = $50 & $48;
      $52 = ($51|0)==(0);
      if (!($52)) {
       $w$0$lcssa$i$i = $w$08$i$i;
       break L31;
      }
      $53 = ((($w$08$i$i)) + 4|0);
      $54 = HEAP32[$53>>2]|0;
      $55 = (($54) + -16843009)|0;
      $56 = $54 & -2139062144;
      $57 = $56 ^ -2139062144;
      $58 = $57 & $55;
      $59 = ($58|0)==(0);
      if ($59) {
       $47 = $54;$w$08$i$i = $53;
      } else {
       $w$0$lcssa$i$i = $53;
       break;
      }
     }
    } else {
     $w$0$lcssa$i$i = $$02$lcssa$i$i;
    }
   } while(0);
   $$1$i$i = $w$0$lcssa$i$i;
   while(1) {
    $60 = HEAP8[$$1$i$i>>0]|0;
    $61 = ((($$1$i$i)) + 1|0);
    switch ($60<<24>>24) {
    case 0: case 44:  {
     $$0$i$i = $$1$i$i;$63 = $60;
     break L29;
     break;
    }
    default: {
     $$1$i$i = $61;
    }
    }
   }
  }
 } while(0);
 $62 = ($$0$i$i|0)==(0|0);
 $not$ = ($63<<24>>24)!=(44);
 $64 = $62 | $not$;
 if ($64) {
  $102 = $simple_mode;
  $103 = $102 ^ (13322);
  $104 = $103 & 3;
  $105 = ($104|0)==(0);
  L41: do {
   if ($105) {
    L43: do {
     if (((((13322) & 3)|0)!=(0))) {
      $$031$i$i10 = 100;$$0430$i$i11 = 13322;$$0629$i$i12 = $simple_mode;
      while(1) {
       $106 = HEAP8[$$0430$i$i11>>0]|0;
       HEAP8[$$0629$i$i12>>0] = $106;
       $107 = ($106<<24>>24)==(0);
       if ($107) {
        $$0$lcssa42$i$i24 = $$031$i$i10;$$04$lcssa43$i$i23 = $$0430$i$i11;$$06$lcssa44$i$i22 = $$0629$i$i12;
        break L43;
       }
       $108 = (($$031$i$i10) + -1)|0;
       $109 = ((($$0430$i$i11)) + 1|0);
       $110 = ((($$0629$i$i12)) + 1|0);
       $111 = $109;
       $112 = $111 & 3;
       $113 = ($112|0)==(0);
       if ($113) {
        $$0$lcssa42$i$i24 = $108;$$04$lcssa43$i$i23 = $109;$$06$lcssa44$i$i22 = $110;
        break;
       } else {
        $$031$i$i10 = $108;$$0430$i$i11 = $109;$$0629$i$i12 = $110;
       }
      }
     } else {
      $$0$lcssa42$i$i24 = 100;$$04$lcssa43$i$i23 = 13322;$$06$lcssa44$i$i22 = $simple_mode;
     }
    } while(0);
    $114 = HEAP8[$$04$lcssa43$i$i23>>0]|0;
    $115 = ($114<<24>>24)==(0);
    if ($115) {
     $$28$i$i51 = $$06$lcssa44$i$i22;$$3$i$i52 = $$0$lcssa42$i$i24;
    } else {
     $116 = ($$0$lcssa42$i$i24>>>0)>(3);
     L49: do {
      if ($116) {
       $$117$i$i29 = $$0$lcssa42$i$i24;$wd$018$i$i28 = $$06$lcssa44$i$i22;$ws$019$i$i27 = $$04$lcssa43$i$i23;
       while(1) {
        $117 = HEAP32[$ws$019$i$i27>>2]|0;
        $118 = (($117) + -16843009)|0;
        $119 = $117 & -2139062144;
        $120 = $119 ^ -2139062144;
        $121 = $120 & $118;
        $122 = ($121|0)==(0);
        if (!($122)) {
         break;
        }
        HEAP32[$wd$018$i$i28>>2] = $117;
        $123 = (($$117$i$i29) + -4)|0;
        $124 = ((($ws$019$i$i27)) + 4|0);
        $125 = ((($wd$018$i$i28)) + 4|0);
        $126 = ($123>>>0)>(3);
        if ($126) {
         $$117$i$i29 = $123;$wd$018$i$i28 = $125;$ws$019$i$i27 = $124;
        } else {
         $$1$lcssa$i$i37 = $123;$wd$0$lcssa$i$i36 = $125;$ws$0$lcssa$i$i35 = $124;
         break L49;
        }
       }
       $$1511$i$i45 = $ws$019$i$i27;$$1710$i$i46 = $wd$018$i$i28;$$212$i$i44 = $$117$i$i29;
       label = 48;
       break L41;
      } else {
       $$1$lcssa$i$i37 = $$0$lcssa42$i$i24;$wd$0$lcssa$i$i36 = $$06$lcssa44$i$i22;$ws$0$lcssa$i$i35 = $$04$lcssa43$i$i23;
      }
     } while(0);
     $127 = ($$1$lcssa$i$i37|0)==(0);
     if ($127) {
      $$28$i$i51 = $wd$0$lcssa$i$i36;$$3$i$i52 = 0;
     } else {
      $$1511$i$i45 = $ws$0$lcssa$i$i35;$$1710$i$i46 = $wd$0$lcssa$i$i36;$$212$i$i44 = $$1$lcssa$i$i37;
      label = 48;
     }
    }
   } else {
    $$1511$i$i45 = 13322;$$1710$i$i46 = $simple_mode;$$212$i$i44 = 100;
    label = 48;
   }
  } while(0);
  L55: do {
   if ((label|0) == 48) {
    while(1) {
     label = 0;
     $128 = HEAP8[$$1511$i$i45>>0]|0;
     HEAP8[$$1710$i$i46>>0] = $128;
     $129 = ($128<<24>>24)==(0);
     if ($129) {
      $$28$i$i51 = $$1710$i$i46;$$3$i$i52 = $$212$i$i44;
      break L55;
     }
     $130 = (($$212$i$i44) + -1)|0;
     $131 = ((($$1511$i$i45)) + 1|0);
     $132 = ((($$1710$i$i46)) + 1|0);
     $133 = ($130|0)==(0);
     if ($133) {
      $$28$i$i51 = $132;$$3$i$i52 = 0;
      break;
     } else {
      $$1511$i$i45 = $131;$$1710$i$i46 = $132;$$212$i$i44 = $130;
      label = 48;
     }
    }
   }
  } while(0);
  _memset(($$28$i$i51|0),0,($$3$i$i52|0))|0;
  $$pre$phi896Z2D = $102;
 } else {
  $65 = $$0$i$i;
  $66 = (($65) - (13322))|0;
  $67 = ($66|0)>(100);
  $$ = $67 ? 100 : $66;
  $68 = $simple_mode;
  $69 = $68 ^ (13322);
  $70 = $69 & 3;
  $71 = ($70|0)==(0);
  L61: do {
   if ($71) {
    $72 = ($$|0)!=(0);
    $or$cond28$i$i = $72 & ((((13322) & 3)|0)!=(0));
    if ($or$cond28$i$i) {
     $$031$i$i = $$;$$0430$i$i = 13322;$$0629$i$i = $simple_mode;
     while(1) {
      $73 = HEAP8[$$0430$i$i>>0]|0;
      HEAP8[$$0629$i$i>>0] = $73;
      $74 = ($73<<24>>24)==(0);
      if ($74) {
       $$28$i$i = $$0629$i$i;$$3$i$i = $$031$i$i;
       break L61;
      }
      $75 = (($$031$i$i) + -1)|0;
      $76 = ((($$0430$i$i)) + 1|0);
      $77 = ((($$0629$i$i)) + 1|0);
      $78 = $76;
      $79 = $78 & 3;
      $80 = ($79|0)!=(0);
      $81 = ($75|0)!=(0);
      $or$cond$i$i3 = $81 & $80;
      if ($or$cond$i$i3) {
       $$031$i$i = $75;$$0430$i$i = $76;$$0629$i$i = $77;
      } else {
       $$0$lcssa$i$i = $75;$$04$lcssa$i$i = $76;$$06$lcssa$i$i = $77;$$lcssa$i$i = $81;
       break;
      }
     }
    } else {
     $$0$lcssa$i$i = $$;$$04$lcssa$i$i = 13322;$$06$lcssa$i$i = $simple_mode;$$lcssa$i$i = $72;
    }
    if ($$lcssa$i$i) {
     $$pre = HEAP8[$$04$lcssa$i$i>>0]|0;
     $82 = ($$pre<<24>>24)==(0);
     if ($82) {
      $$28$i$i = $$06$lcssa$i$i;$$3$i$i = $$0$lcssa$i$i;
     } else {
      $83 = ($$0$lcssa$i$i>>>0)>(3);
      L70: do {
       if ($83) {
        $$117$i$i = $$0$lcssa$i$i;$wd$018$i$i = $$06$lcssa$i$i;$ws$019$i$i = $$04$lcssa$i$i;
        while(1) {
         $84 = HEAP32[$ws$019$i$i>>2]|0;
         $85 = (($84) + -16843009)|0;
         $86 = $84 & -2139062144;
         $87 = $86 ^ -2139062144;
         $88 = $87 & $85;
         $89 = ($88|0)==(0);
         if (!($89)) {
          $$1$lcssa$i$i = $$117$i$i;$wd$0$lcssa$i$i = $wd$018$i$i;$ws$0$lcssa$i$i = $ws$019$i$i;
          break L70;
         }
         HEAP32[$wd$018$i$i>>2] = $84;
         $90 = (($$117$i$i) + -4)|0;
         $91 = ((($ws$019$i$i)) + 4|0);
         $92 = ((($wd$018$i$i)) + 4|0);
         $93 = ($90>>>0)>(3);
         if ($93) {
          $$117$i$i = $90;$wd$018$i$i = $92;$ws$019$i$i = $91;
         } else {
          $$1$lcssa$i$i = $90;$wd$0$lcssa$i$i = $92;$ws$0$lcssa$i$i = $91;
          break;
         }
        }
       } else {
        $$1$lcssa$i$i = $$0$lcssa$i$i;$wd$0$lcssa$i$i = $$06$lcssa$i$i;$ws$0$lcssa$i$i = $$04$lcssa$i$i;
       }
      } while(0);
      $$15$ph$i$i = $ws$0$lcssa$i$i;$$17$ph$i$i = $wd$0$lcssa$i$i;$$2$ph$i$i = $$1$lcssa$i$i;
      label = 34;
     }
    } else {
     $$28$i$i = $$06$lcssa$i$i;$$3$i$i = 0;
    }
   } else {
    $$15$ph$i$i = 13322;$$17$ph$i$i = $simple_mode;$$2$ph$i$i = $$;
    label = 34;
   }
  } while(0);
  L75: do {
   if ((label|0) == 34) {
    $94 = ($$2$ph$i$i|0)==(0);
    if ($94) {
     $$28$i$i = $$17$ph$i$i;$$3$i$i = 0;
    } else {
     $$1511$i$i = $$15$ph$i$i;$$1710$i$i = $$17$ph$i$i;$$212$i$i = $$2$ph$i$i;
     while(1) {
      $95 = HEAP8[$$1511$i$i>>0]|0;
      HEAP8[$$1710$i$i>>0] = $95;
      $96 = ($95<<24>>24)==(0);
      if ($96) {
       $$28$i$i = $$1710$i$i;$$3$i$i = $$212$i$i;
       break L75;
      }
      $97 = (($$212$i$i) + -1)|0;
      $98 = ((($$1511$i$i)) + 1|0);
      $99 = ((($$1710$i$i)) + 1|0);
      $100 = ($97|0)==(0);
      if ($100) {
       $$28$i$i = $99;$$3$i$i = 0;
       break;
      } else {
       $$1511$i$i = $98;$$1710$i$i = $99;$$212$i$i = $97;
      }
     }
    }
   }
  } while(0);
  _memset(($$28$i$i|0),0,($$3$i$i|0))|0;
  $101 = (($simple_mode) + ($66)|0);
  HEAP8[$101>>0] = 0;
  $$pre$phi896Z2D = $68;
 }
 $134 = $$pre$phi896Z2D & 3;
 $135 = ($134|0)==(0);
 L82: do {
  if ($135) {
   $$02$lcssa$i$i59 = $simple_mode;
   label = 54;
  } else {
   $$0211$i$i56 = $simple_mode;
   while(1) {
    $136 = HEAP8[$$0211$i$i56>>0]|0;
    switch ($136<<24>>24) {
    case 0: case 114:  {
     $$0$i$i72 = $$0211$i$i56;$164 = $136;
     break L82;
     break;
    }
    default: {
    }
    }
    $137 = ((($$0211$i$i56)) + 1|0);
    $138 = $137;
    $139 = $138 & 3;
    $140 = ($139|0)==(0);
    if ($140) {
     $$02$lcssa$i$i59 = $137;
     label = 54;
     break L82;
    } else {
     $$0211$i$i56 = $137;
    }
   }
  }
 } while(0);
 L86: do {
  if ((label|0) == 54) {
   $141 = HEAP32[$$02$lcssa$i$i59>>2]|0;
   $142 = (($141) + -16843009)|0;
   $143 = $141 & -2139062144;
   $144 = $143 ^ -2139062144;
   $145 = $144 & $142;
   $146 = ($145|0)==(0);
   L88: do {
    if ($146) {
     $148 = $141;$w$08$i$i62 = $$02$lcssa$i$i59;
     while(1) {
      $147 = $148 ^ 1920103026;
      $149 = (($147) + -16843009)|0;
      $150 = $148 & -2139062144;
      $151 = $150 ^ -2139062144;
      $152 = $151 & $149;
      $153 = ($152|0)==(0);
      if (!($153)) {
       $w$0$lcssa$i$i66 = $w$08$i$i62;
       break L88;
      }
      $154 = ((($w$08$i$i62)) + 4|0);
      $155 = HEAP32[$154>>2]|0;
      $156 = (($155) + -16843009)|0;
      $157 = $155 & -2139062144;
      $158 = $157 ^ -2139062144;
      $159 = $158 & $156;
      $160 = ($159|0)==(0);
      if ($160) {
       $148 = $155;$w$08$i$i62 = $154;
      } else {
       $w$0$lcssa$i$i66 = $154;
       break;
      }
     }
    } else {
     $w$0$lcssa$i$i66 = $$02$lcssa$i$i59;
    }
   } while(0);
   $$1$i$i68 = $w$0$lcssa$i$i66;
   while(1) {
    $161 = HEAP8[$$1$i$i68>>0]|0;
    $162 = ((($$1$i$i68)) + 1|0);
    switch ($161<<24>>24) {
    case 0: case 114:  {
     $$0$i$i72 = $$1$i$i68;$164 = $161;
     break L86;
     break;
    }
    default: {
     $$1$i$i68 = $162;
    }
    }
   }
  }
 } while(0);
 $163 = ($$0$i$i72|0)==(0|0);
 $not$84 = ($164<<24>>24)!=(114);
 $165 = $163 | $not$84;
 do {
  if ($165) {
   label = 654;
  } else {
   $166 = ((($0)) + 40|0);
   $167 = (_hpeek($hfile,$s$i,18)|0);
   $168 = ($167|0)<(0);
   if (!($168)) {
    $169 = ($167|0)>(1);
    $170 = HEAP8[$s$i>>0]|0;
    $171 = ($170<<24>>24)==(31);
    $or$cond1616 = $169 & $171;
    if ($or$cond1616) {
     $172 = ((($s$i)) + 1|0);
     $173 = HEAP8[$172>>0]|0;
     $174 = ($173<<24>>24)==(-117);
     if ($174) {
      $175 = ($167|0)>(17);
      do {
       if ($175) {
        $176 = ((($s$i)) + 3|0);
        $177 = HEAP8[$176>>0]|0;
        $178 = $177 & 4;
        $179 = ($178<<24>>24)==(0);
        if ($179) {
         $190 = 1;
        } else {
         $180 = ((($s$i)) + 12|0);
         $$03$i$i = 4;$l$04$i$i = $180;$r$05$i$i = 13738;
         while(1) {
          $181 = HEAP8[$l$04$i$i>>0]|0;
          $182 = HEAP8[$r$05$i$i>>0]|0;
          $183 = ($181<<24>>24)==($182<<24>>24);
          if (!($183)) {
           label = 68;
           break;
          }
          $184 = (($$03$i$i) + -1)|0;
          $185 = ((($l$04$i$i)) + 1|0);
          $186 = ((($r$05$i$i)) + 1|0);
          $187 = ($184|0)==(0);
          if ($187) {
           break;
          } else {
           $$03$i$i = $184;$l$04$i$i = $185;$r$05$i$i = $186;
          }
         }
         if ((label|0) == 68) {
          $188 = ($181<<24>>24)==($182<<24>>24);
          if (!($188)) {
           $190 = 1;
           break;
          }
         }
         $190 = 2;
        }
       } else {
        $190 = 1;
       }
      } while(0);
      $189 = ((($0)) + 52|0);
      HEAP32[$189>>2] = $190;
      $191 = (_hpeek($hfile,$buffer$i$i,512)|0);
      $192 = ($191|0)<(0);
      if ($192) {
       $$0$i$i82 = 0;
      } else {
       $193 = (_zcalloc(0,1,7116)|0);
       $194 = ($193|0)==(0|0);
       if ($194) {
        $$0$i$i82 = 0;
       } else {
        $195 = ((($193)) + 52|0);
        HEAP32[$195>>2] = 0;
        $196 = ((($193)) + 52|0);
        $$pre906 = ((($193)) + 36|0);
        $197 = ((($193)) + 8|0);
        HEAP32[$197>>2] = 2;
        HEAP32[$$pre906>>2] = 15;
        $198 = ((($193)) + 40|0);
        HEAP32[$198>>2] = 0;
        $199 = ((($193)) + 44|0);
        HEAP32[$199>>2] = 0;
        $200 = ((($193)) + 48|0);
        HEAP32[$200>>2] = 0;
        $201 = ((($193)) + 28|0);
        HEAP32[$201>>2] = 0;
        HEAP32[$193>>2] = 0;
        $202 = ((($193)) + 4|0);
        HEAP32[$202>>2] = 0;
        $203 = ((($193)) + 12|0);
        HEAP32[$203>>2] = 0;
        $204 = ((($193)) + 20|0);
        HEAP32[$204>>2] = 32768;
        $205 = ((($193)) + 32|0);
        HEAP32[$205>>2] = 0;
        $206 = ((($193)) + 56|0);
        HEAP32[$206>>2] = 0;
        $207 = ((($193)) + 60|0);
        HEAP32[$207>>2] = 0;
        $208 = ((($193)) + 1328|0);
        $209 = ((($193)) + 108|0);
        HEAP32[$209>>2] = $208;
        $210 = ((($193)) + 80|0);
        HEAP32[$210>>2] = $208;
        $211 = ((($193)) + 76|0);
        HEAP32[$211>>2] = $208;
        $212 = ((($193)) + 7104|0);
        HEAP32[$212>>2] = 1;
        $213 = ((($193)) + 7108|0);
        HEAP32[$213>>2] = -1;
        $214 = ((($193)) + 16|0);
        $215 = ((($193)) + 24|0);
        $216 = ((($hbuf$i$i$i)) + 1|0);
        $217 = ((($193)) + 64|0);
        $218 = ((($193)) + 84|0);
        $219 = ((($193)) + 88|0);
        $220 = ((($193)) + 104|0);
        $221 = ((($193)) + 96|0);
        $222 = ((($193)) + 100|0);
        $223 = ((($193)) + 624|0);
        $$cast$i$i$i = $208;
        $224 = ((($193)) + 112|0);
        $225 = ((($193)) + 752|0);
        $226 = ((($193)) + 72|0);
        $227 = ((($193)) + 7112|0);
        $228 = ((($193)) + 68|0);
        $229 = ((($hbuf$i$i$i)) + 2|0);
        $230 = ((($hbuf$i$i$i)) + 3|0);
        $231 = ((($193)) + 92|0);
        $zs$i$i$sroa$0$0 = $buffer$i$i;$zs$i$i$sroa$11$0 = $191;$zs$i$i$sroa$24$0 = $s$i;$zs$i$i$sroa$36$0 = 21;$zs$i$i$sroa$47$0 = 0;
        L116: while(1) {
         $232 = ($zs$i$i$sroa$47$0>>>0)<(21);
         if (!($232)) {
          $zs$i$i$sroa$47$6 = $zs$i$i$sroa$47$0;
          break;
         }
         $233 = ($zs$i$i$sroa$24$0|0)==(0|0);
         if ($233) {
          $zs$i$i$sroa$47$5$ph = $zs$i$i$sroa$47$0;
          label = 442;
          break;
         }
         $234 = ($zs$i$i$sroa$0$0|0)!=(0|0);
         $235 = ($zs$i$i$sroa$11$0|0)==(0);
         $or$cond1617 = $234 | $235;
         if (!($or$cond1617)) {
          $zs$i$i$sroa$47$5$ph = $zs$i$i$sroa$47$0;
          label = 442;
          break;
         }
         $236 = HEAP32[$193>>2]|0;
         $237 = ($236|0)==(11);
         if ($237) {
          HEAP32[$193>>2] = 12;
          $1810 = 12;
         } else {
          $1810 = $236;
         }
         $238 = HEAP32[$207>>2]|0;
         $239 = HEAP32[$206>>2]|0;
         $240 = $1810;$bits$0$i$i$i = $238;$have$0$i$i$i = $zs$i$i$sroa$11$0;$hold$0$i$i$i = $239;$left$0$i$i$i = $zs$i$i$sroa$36$0;$next$0$i$i$i = $zs$i$i$sroa$0$0;$out$0$i$i$i = $zs$i$i$sroa$36$0;$put$0$i$i$i = $zs$i$i$sroa$24$0;$ret$0$i$i$i = 0;$zs$i$i$sroa$0$1 = $zs$i$i$sroa$0$0;$zs$i$i$sroa$11$1 = $zs$i$i$sroa$11$0;$zs$i$i$sroa$24$1 = $zs$i$i$sroa$24$0;$zs$i$i$sroa$36$1 = $zs$i$i$sroa$36$0;$zs$i$i$sroa$47$1 = $zs$i$i$sroa$47$0;
         L124: while(1) {
          L126: do {
           switch ($240|0) {
           case 28:  {
            $bits$61$i$i$i$ph = $bits$0$i$i$i;$have$65$i$i$i$ph = $have$0$i$i$i;$hold$61$i$i$i$ph = $hold$0$i$i$i;$left$0$i$i$i$lcssa660 = $left$0$i$i$i;$next$65$i$i$i$ph = $next$0$i$i$i;$ret$9$i$i$i$ph = 1;
            label = 419;
            break L124;
            break;
           }
           case 29:  {
            $bits$61$i$i$i = $bits$0$i$i$i;$have$65$i$i$i = $have$0$i$i$i;$hold$61$i$i$i = $hold$0$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$0$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = -3;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
            break L124;
            break;
           }
           case 0:  {
            $241 = HEAP32[$197>>2]|0;
            $242 = ($241|0)==(0);
            if ($242) {
             HEAP32[$193>>2] = 12;
             $bits$0$i$i$i$be = $bits$0$i$i$i;$have$0$i$i$i$be = $have$0$i$i$i;$hold$0$i$i$i$be = $hold$0$i$i$i;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$0$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
             break L126;
            } else {
             $bits$1$i$i$i = $bits$0$i$i$i;$have$1$i$i$i = $have$0$i$i$i;$hold$1$i$i$i = $hold$0$i$i$i;$next$1$i$i$i = $next$0$i$i$i;
            }
            while(1) {
             $243 = ($bits$1$i$i$i>>>0)<(16);
             if (!($243)) {
              break;
             }
             $244 = ($have$1$i$i$i|0)==(0);
             if ($244) {
              $bits$61$i$i$i = $bits$1$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$1$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$1$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$0$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
              break L124;
             }
             $245 = (($bits$1$i$i$i) + 8)|0;
             $246 = HEAP8[$next$1$i$i$i>>0]|0;
             $247 = $246&255;
             $248 = $247 << $bits$1$i$i$i;
             $249 = (($hold$1$i$i$i) + ($248))|0;
             $250 = ((($next$1$i$i$i)) + 1|0);
             $251 = (($have$1$i$i$i) + -1)|0;
             $bits$1$i$i$i = $245;$have$1$i$i$i = $251;$hold$1$i$i$i = $249;$next$1$i$i$i = $250;
            }
            $252 = $241 & 2;
            $253 = ($252|0)!=(0);
            $254 = ($hold$1$i$i$i|0)==(35615);
            $or$cond1618 = $253 & $254;
            if ($or$cond1618) {
             HEAP32[$215>>2] = 0;
             HEAP8[$hbuf$i$i$i>>0] = 31;
             HEAP8[$216>>0] = -117;
             $255 = HEAP32[$215>>2]|0;
             $256 = (_crc32($255,$hbuf$i$i$i,2)|0);
             HEAP32[$215>>2] = $256;
             HEAP32[$193>>2] = 1;
             $bits$0$i$i$i$be = 0;$have$0$i$i$i$be = $have$1$i$i$i;$hold$0$i$i$i$be = 0;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$1$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
             break L126;
            }
            HEAP32[$214>>2] = 0;
            $257 = HEAP32[$205>>2]|0;
            $258 = ($257|0)==(0|0);
            if ($258) {
             $261 = $241;
            } else {
             $259 = ((($257)) + 48|0);
             HEAP32[$259>>2] = -1;
             $$pre880 = HEAP32[$197>>2]|0;
             $261 = $$pre880;
            }
            $260 = $261 & 1;
            $262 = ($260|0)==(0);
            do {
             if (!($262)) {
              $263 = $hold$1$i$i$i << 8;
              $264 = $263 & 65280;
              $265 = $hold$1$i$i$i >>> 8;
              $266 = (($264) + ($265))|0;
              $267 = (($266>>>0) % 31)&-1;
              $268 = ($267|0)==(0);
              if (!($268)) {
               break;
              }
              $269 = $hold$1$i$i$i & 15;
              $270 = ($269|0)==(8);
              if (!($270)) {
               HEAP32[$193>>2] = 29;
               $bits$0$i$i$i$be = $bits$1$i$i$i;$have$0$i$i$i$be = $have$1$i$i$i;$hold$0$i$i$i$be = $hold$1$i$i$i;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$1$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
               break L126;
              }
              $271 = $hold$1$i$i$i >>> 4;
              $272 = (($bits$1$i$i$i) + -4)|0;
              $273 = $271 & 15;
              $274 = (($273) + 8)|0;
              $275 = HEAP32[$$pre906>>2]|0;
              $276 = ($275|0)==(0);
              do {
               if ($276) {
                HEAP32[$$pre906>>2] = $274;
               } else {
                $277 = ($274>>>0)>($275>>>0);
                if (!($277)) {
                 break;
                }
                HEAP32[$193>>2] = 29;
                $bits$0$i$i$i$be = $272;$have$0$i$i$i$be = $have$1$i$i$i;$hold$0$i$i$i$be = $271;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$1$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
                break L126;
               }
              } while(0);
              $278 = 1 << $274;
              HEAP32[$204>>2] = $278;
              HEAP32[$215>>2] = 1;
              $279 = $hold$1$i$i$i >>> 12;
              $280 = $279 & 2;
              $281 = $280 ^ 11;
              HEAP32[$193>>2] = $281;
              $bits$0$i$i$i$be = 0;$have$0$i$i$i$be = $have$1$i$i$i;$hold$0$i$i$i$be = 0;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$1$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
              break L126;
             }
            } while(0);
            HEAP32[$193>>2] = 29;
            $bits$0$i$i$i$be = $bits$1$i$i$i;$have$0$i$i$i$be = $have$1$i$i$i;$hold$0$i$i$i$be = $hold$1$i$i$i;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$1$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
            break;
           }
           case 1:  {
            $289 = $hold$0$i$i$i;$bits$2$i$i$i = $bits$0$i$i$i;$have$2$i$i$i = $have$0$i$i$i;$next$2$i$i$i = $next$0$i$i$i;
            while(1) {
             $282 = ($bits$2$i$i$i>>>0)<(16);
             if (!($282)) {
              break;
             }
             $283 = ($have$2$i$i$i|0)==(0);
             if ($283) {
              $bits$61$i$i$i = $bits$2$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $289;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$2$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$0$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
              break L124;
             }
             $284 = (($bits$2$i$i$i) + 8)|0;
             $285 = HEAP8[$next$2$i$i$i>>0]|0;
             $286 = $285&255;
             $287 = $286 << $bits$2$i$i$i;
             $288 = (($289) + ($287))|0;
             $290 = ((($next$2$i$i$i)) + 1|0);
             $291 = (($have$2$i$i$i) + -1)|0;
             $289 = $288;$bits$2$i$i$i = $284;$have$2$i$i$i = $291;$next$2$i$i$i = $290;
            }
            HEAP32[$214>>2] = $289;
            $292 = $289 & 255;
            $293 = ($292|0)==(8);
            if (!($293)) {
             HEAP32[$193>>2] = 29;
             $bits$0$i$i$i$be = $bits$2$i$i$i;$have$0$i$i$i$be = $have$2$i$i$i;$hold$0$i$i$i$be = $289;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$2$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
             break L126;
            }
            $294 = $289 & 57344;
            $295 = ($294|0)==(0);
            if (!($295)) {
             HEAP32[$193>>2] = 29;
             $bits$0$i$i$i$be = $bits$2$i$i$i;$have$0$i$i$i$be = $have$2$i$i$i;$hold$0$i$i$i$be = $289;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$2$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
             break L126;
            }
            $296 = HEAP32[$205>>2]|0;
            $297 = ($296|0)==(0|0);
            if ($297) {
             $301 = $289;
            } else {
             $298 = $289 >>> 8;
             $299 = $298 & 1;
             HEAP32[$296>>2] = $299;
             $$pre875 = HEAP32[$214>>2]|0;
             $301 = $$pre875;
            }
            $300 = $301 & 512;
            $302 = ($300|0)==(0);
            if (!($302)) {
             $303 = $289&255;
             HEAP8[$hbuf$i$i$i>>0] = $303;
             $304 = $289 >>> 8;
             $305 = $304&255;
             HEAP8[$216>>0] = $305;
             $306 = HEAP32[$215>>2]|0;
             $307 = (_crc32($306,$hbuf$i$i$i,2)|0);
             HEAP32[$215>>2] = $307;
            }
            HEAP32[$193>>2] = 2;
            $bits$4$i$i$i = 0;$have$4$i$i$i = $have$2$i$i$i;$hold$4$i$i$i = 0;$next$4$i$i$i = $next$2$i$i$i;
            label = 116;
            break;
           }
           case 2:  {
            $bits$4$i$i$i = $bits$0$i$i$i;$have$4$i$i$i = $have$0$i$i$i;$hold$4$i$i$i = $hold$0$i$i$i;$next$4$i$i$i = $next$0$i$i$i;
            label = 116;
            break;
           }
           case 3:  {
            $bits$6$i$i$i = $bits$0$i$i$i;$have$6$i$i$i = $have$0$i$i$i;$hold$6$i$i$i = $hold$0$i$i$i;$next$6$i$i$i = $next$0$i$i$i;
            label = 124;
            break;
           }
           case 4:  {
            $bits$7$i$i$i = $bits$0$i$i$i;$have$7$i$i$i = $have$0$i$i$i;$hold$7$i$i$i = $hold$0$i$i$i;$next$7$i$i$i = $next$0$i$i$i;
            label = 132;
            break;
           }
           case 5:  {
            $bits$10$i$i$i = $bits$0$i$i$i;$have$10$i$i$i = $have$0$i$i$i;$hold$10$i$i$i = $hold$0$i$i$i;$next$10$i$i$i = $next$0$i$i$i;
            label = 143;
            break;
           }
           case 6:  {
            $$pre879 = HEAP32[$214>>2]|0;
            $414 = $$pre879;$bits$11$i$i$i = $bits$0$i$i$i;$have$13$i$i$i = $have$0$i$i$i;$hold$11$i$i$i = $hold$0$i$i$i;$next$13$i$i$i = $next$0$i$i$i;
            label = 153;
            break;
           }
           case 7:  {
            $bits$12$i$i$i = $bits$0$i$i$i;$have$15$i$i$i = $have$0$i$i$i;$hold$12$i$i$i = $hold$0$i$i$i;$next$15$i$i$i = $next$0$i$i$i;
            label = 166;
            break;
           }
           case 8:  {
            $bits$13$i$i$i = $bits$0$i$i$i;$have$17$i$i$i = $have$0$i$i$i;$hold$13$i$i$i = $hold$0$i$i$i;$next$17$i$i$i = $next$0$i$i$i;
            label = 179;
            break;
           }
           case 9:  {
            $bits$16$i$i$i = $bits$0$i$i$i;$have$20$i$i$i = $have$0$i$i$i;$hold$16$i$i$i = $hold$0$i$i$i;$next$20$i$i$i = $next$0$i$i$i;
            while(1) {
             $499 = ($bits$16$i$i$i>>>0)<(32);
             if (!($499)) {
              break;
             }
             $500 = ($have$20$i$i$i|0)==(0);
             if ($500) {
              $bits$61$i$i$i = $bits$16$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$16$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$20$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$0$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
              break L124;
             }
             $501 = (($bits$16$i$i$i) + 8)|0;
             $502 = HEAP8[$next$20$i$i$i>>0]|0;
             $503 = $502&255;
             $504 = $503 << $bits$16$i$i$i;
             $505 = (($hold$16$i$i$i) + ($504))|0;
             $506 = ((($next$20$i$i$i)) + 1|0);
             $507 = (($have$20$i$i$i) + -1)|0;
             $bits$16$i$i$i = $501;$have$20$i$i$i = $507;$hold$16$i$i$i = $505;$next$20$i$i$i = $506;
            }
            $508 = (_llvm_bswap_i32(($hold$16$i$i$i|0))|0);
            HEAP32[$215>>2] = $508;
            HEAP32[$193>>2] = 10;
            $bits$17$i$i$i = 0;$have$21$i$i$i = $have$20$i$i$i;$hold$17$i$i$i = 0;$next$21$i$i$i = $next$20$i$i$i;
            label = 192;
            break;
           }
           case 10:  {
            $bits$17$i$i$i = $bits$0$i$i$i;$have$21$i$i$i = $have$0$i$i$i;$hold$17$i$i$i = $hold$0$i$i$i;$next$21$i$i$i = $next$0$i$i$i;
            label = 192;
            break;
           }
           case 12: case 11:  {
            $bits$19$i$i$i = $bits$0$i$i$i;$have$23$i$i$i = $have$0$i$i$i;$hold$19$i$i$i = $hold$0$i$i$i;$next$23$i$i$i = $next$0$i$i$i;
            label = 195;
            break;
           }
           case 13:  {
            $530 = $bits$0$i$i$i & 7;
            $531 = $hold$0$i$i$i >>> $530;
            $532 = $bits$0$i$i$i & -8;
            $bits$21$i$i$i = $532;$have$25$i$i$i = $have$0$i$i$i;$hold$21$i$i$i = $531;$next$25$i$i$i = $next$0$i$i$i;
            while(1) {
             $533 = ($bits$21$i$i$i>>>0)<(32);
             if (!($533)) {
              break;
             }
             $534 = ($have$25$i$i$i|0)==(0);
             if ($534) {
              $bits$61$i$i$i = $bits$21$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$21$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$25$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$0$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
              break L124;
             }
             $535 = (($bits$21$i$i$i) + 8)|0;
             $536 = HEAP8[$next$25$i$i$i>>0]|0;
             $537 = $536&255;
             $538 = $537 << $bits$21$i$i$i;
             $539 = (($hold$21$i$i$i) + ($538))|0;
             $540 = ((($next$25$i$i$i)) + 1|0);
             $541 = (($have$25$i$i$i) + -1)|0;
             $bits$21$i$i$i = $535;$have$25$i$i$i = $541;$hold$21$i$i$i = $539;$next$25$i$i$i = $540;
            }
            $542 = $hold$21$i$i$i & 65535;
            $543 = $hold$21$i$i$i >>> 16;
            $544 = $543 ^ 65535;
            $545 = ($542|0)==($544|0);
            if ($545) {
             HEAP32[$217>>2] = $542;
             HEAP32[$193>>2] = 14;
             $bits$22$i$i$i = 0;$have$26$i$i$i = $have$25$i$i$i;$hold$22$i$i$i = 0;$next$26$i$i$i = $next$25$i$i$i;
             label = 214;
             break L126;
            } else {
             HEAP32[$193>>2] = 29;
             $bits$0$i$i$i$be = $bits$21$i$i$i;$have$0$i$i$i$be = $have$25$i$i$i;$hold$0$i$i$i$be = $hold$21$i$i$i;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$25$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
             break L126;
            }
            break;
           }
           case 14:  {
            $bits$22$i$i$i = $bits$0$i$i$i;$have$26$i$i$i = $have$0$i$i$i;$hold$22$i$i$i = $hold$0$i$i$i;$next$26$i$i$i = $next$0$i$i$i;
            label = 214;
            break;
           }
           case 15:  {
            $bits$23$i$i$i = $bits$0$i$i$i;$have$27$i$i$i = $have$0$i$i$i;$hold$23$i$i$i = $hold$0$i$i$i;$next$27$i$i$i = $next$0$i$i$i;
            label = 215;
            break;
           }
           case 16:  {
            $bits$24$i$i$i = $bits$0$i$i$i;$have$28$i$i$i = $have$0$i$i$i;$hold$24$i$i$i = $hold$0$i$i$i;$next$28$i$i$i = $next$0$i$i$i;
            while(1) {
             $557 = ($bits$24$i$i$i>>>0)<(14);
             if (!($557)) {
              break;
             }
             $558 = ($have$28$i$i$i|0)==(0);
             if ($558) {
              $bits$61$i$i$i = $bits$24$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$24$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$28$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$0$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
              break L124;
             }
             $559 = (($bits$24$i$i$i) + 8)|0;
             $560 = HEAP8[$next$28$i$i$i>>0]|0;
             $561 = $560&255;
             $562 = $561 << $bits$24$i$i$i;
             $563 = (($hold$24$i$i$i) + ($562))|0;
             $564 = ((($next$28$i$i$i)) + 1|0);
             $565 = (($have$28$i$i$i) + -1)|0;
             $bits$24$i$i$i = $559;$have$28$i$i$i = $565;$hold$24$i$i$i = $563;$next$28$i$i$i = $564;
            }
            $566 = $hold$24$i$i$i & 31;
            $567 = (($566) + 257)|0;
            HEAP32[$221>>2] = $567;
            $568 = $hold$24$i$i$i >>> 5;
            $569 = $568 & 31;
            $570 = (($569) + 1)|0;
            HEAP32[$222>>2] = $570;
            $571 = $hold$24$i$i$i >>> 10;
            $572 = $571 & 15;
            $573 = (($572) + 4)|0;
            HEAP32[$231>>2] = $573;
            $574 = $hold$24$i$i$i >>> 14;
            $575 = (($bits$24$i$i$i) + -14)|0;
            $576 = ($567>>>0)>(286);
            $577 = ($570>>>0)>(30);
            $or$cond1619 = $576 | $577;
            if ($or$cond1619) {
             HEAP32[$193>>2] = 29;
             $bits$0$i$i$i$be = $575;$have$0$i$i$i$be = $have$28$i$i$i;$hold$0$i$i$i$be = $574;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$28$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
             break L126;
            } else {
             HEAP32[$220>>2] = 0;
             HEAP32[$193>>2] = 17;
             $$pre864 = 0;$$pre865 = $573;$bits$26$i$i$i$ph = $575;$have$30$i$i$i$ph = $have$28$i$i$i;$hold$26$i$i$i$ph = $574;$next$30$i$i$i$ph = $next$28$i$i$i;
             label = 225;
             break L126;
            }
            break;
           }
           case 17:  {
            $$pre864$pre = HEAP32[$220>>2]|0;
            $$pre865$pre = HEAP32[$231>>2]|0;
            $$pre864 = $$pre864$pre;$$pre865 = $$pre865$pre;$bits$26$i$i$i$ph = $bits$0$i$i$i;$have$30$i$i$i$ph = $have$0$i$i$i;$hold$26$i$i$i$ph = $hold$0$i$i$i;$next$30$i$i$i$ph = $next$0$i$i$i;
            label = 225;
            break;
           }
           case 18:  {
            $bits$28$i$i$i = $bits$0$i$i$i;$have$32$i$i$i = $have$0$i$i$i;$hold$28$i$i$i = $hold$0$i$i$i;$next$32$i$i$i = $next$0$i$i$i;$ret$1$i$i$i = $ret$0$i$i$i;
            label = 236;
            break;
           }
           case 19:  {
            $bits$38$i$i$i = $bits$0$i$i$i;$have$42$i$i$i = $have$0$i$i$i;$hold$38$i$i$i = $hold$0$i$i$i;$next$42$i$i$i = $next$0$i$i$i;$ret$2$i$i$i = $ret$0$i$i$i;
            label = 275;
            break;
           }
           case 20:  {
            $bits$39$i$i$i = $bits$0$i$i$i;$have$43$i$i$i = $have$0$i$i$i;$hold$39$i$i$i = $hold$0$i$i$i;$next$43$i$i$i = $next$0$i$i$i;$ret$3$i$i$i = $ret$0$i$i$i;
            label = 276;
            break;
           }
           case 21:  {
            $$pre868 = HEAP32[$226>>2]|0;
            $1022 = $$pre868;$bits$43$i$i$i = $bits$0$i$i$i;$have$47$i$i$i = $have$0$i$i$i;$hold$43$i$i$i = $hold$0$i$i$i;$next$47$i$i$i = $next$0$i$i$i;$ret$4$i$i$i = $ret$0$i$i$i;
            label = 355;
            break;
           }
           case 22:  {
            $bits$46$i$i$i = $bits$0$i$i$i;$have$50$i$i$i = $have$0$i$i$i;$hold$46$i$i$i = $hold$0$i$i$i;$next$50$i$i$i = $next$0$i$i$i;$ret$5$i$i$i = $ret$0$i$i$i;
            label = 362;
            break;
           }
           case 23:  {
            $$pre874 = HEAP32[$226>>2]|0;
            $1099 = $$pre874;$bits$50$i$i$i = $bits$0$i$i$i;$have$54$i$i$i = $have$0$i$i$i;$hold$50$i$i$i = $hold$0$i$i$i;$next$54$i$i$i = $next$0$i$i$i;$ret$6$i$i$i = $ret$0$i$i$i;
            label = 376;
            break;
           }
           case 24:  {
            $bits$53$i$i$i = $bits$0$i$i$i;$have$57$i$i$i = $have$0$i$i$i;$hold$53$i$i$i = $hold$0$i$i$i;$next$57$i$i$i = $next$0$i$i$i;$ret$7$i$i$i = $ret$0$i$i$i;
            label = 382;
            break;
           }
           case 25:  {
            $1153 = ($left$0$i$i$i|0)==(0);
            if ($1153) {
             $bits$61$i$i$i$ph = $bits$0$i$i$i;$have$65$i$i$i$ph = $have$0$i$i$i;$hold$61$i$i$i$ph = $hold$0$i$i$i;$left$0$i$i$i$lcssa660 = 0;$next$65$i$i$i$ph = $next$0$i$i$i;$ret$9$i$i$i$ph = $ret$0$i$i$i;
             label = 419;
             break L124;
            }
            $1154 = HEAP32[$217>>2]|0;
            $1155 = $1154&255;
            $1156 = ((($put$0$i$i$i)) + 1|0);
            HEAP8[$put$0$i$i$i>>0] = $1155;
            $1157 = (($left$0$i$i$i) + -1)|0;
            HEAP32[$193>>2] = 20;
            $bits$0$i$i$i$be = $bits$0$i$i$i;$have$0$i$i$i$be = $have$0$i$i$i;$hold$0$i$i$i$be = $hold$0$i$i$i;$left$0$i$i$i$be = $1157;$next$0$i$i$i$be = $next$0$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $1156;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
            break;
           }
           case 26:  {
            $1158 = HEAP32[$197>>2]|0;
            $1159 = ($1158|0)==(0);
            do {
             if ($1159) {
              $bits$55$i$i$i = $bits$0$i$i$i;$have$59$i$i$i = $have$0$i$i$i;$hold$55$i$i$i = $hold$0$i$i$i;$next$59$i$i$i = $next$0$i$i$i;$out$1$i$i$i = $out$0$i$i$i;$zs$i$i$sroa$47$2 = $zs$i$i$sroa$47$1;
             } else {
              $bits$54$i$i$i = $bits$0$i$i$i;$have$58$i$i$i = $have$0$i$i$i;$hold$54$i$i$i = $hold$0$i$i$i;$next$58$i$i$i = $next$0$i$i$i;
              while(1) {
               $1160 = ($bits$54$i$i$i>>>0)<(32);
               if (!($1160)) {
                break;
               }
               $1161 = ($have$58$i$i$i|0)==(0);
               if ($1161) {
                $bits$61$i$i$i = $bits$54$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$54$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$58$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$0$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
                break L124;
               }
               $1162 = (($bits$54$i$i$i) + 8)|0;
               $1163 = HEAP8[$next$58$i$i$i>>0]|0;
               $1164 = $1163&255;
               $1165 = $1164 << $bits$54$i$i$i;
               $1166 = (($hold$54$i$i$i) + ($1165))|0;
               $1167 = ((($next$58$i$i$i)) + 1|0);
               $1168 = (($have$58$i$i$i) + -1)|0;
               $bits$54$i$i$i = $1162;$have$58$i$i$i = $1168;$hold$54$i$i$i = $1166;$next$58$i$i$i = $1167;
              }
              $1169 = (($out$0$i$i$i) - ($left$0$i$i$i))|0;
              $1170 = (($zs$i$i$sroa$47$1) + ($1169))|0;
              $1171 = HEAP32[$201>>2]|0;
              $1172 = (($1171) + ($1169))|0;
              HEAP32[$201>>2] = $1172;
              $1173 = ($out$0$i$i$i|0)==($left$0$i$i$i|0);
              $$pre861 = HEAP32[$214>>2]|0;
              if (!($1173)) {
               $1174 = ($$pre861|0)==(0);
               $1175 = HEAP32[$215>>2]|0;
               $1176 = (0 - ($1169))|0;
               $1177 = (($put$0$i$i$i) + ($1176)|0);
               if ($1174) {
                $1179 = (_adler32($1175,$1177,$1169)|0);
                $1180 = $1179;
               } else {
                $1178 = (_crc32($1175,$1177,$1169)|0);
                $1180 = $1178;
               }
               HEAP32[$215>>2] = $1180;
              }
              $1181 = ($$pre861|0)==(0);
              $1182 = (_llvm_bswap_i32(($hold$54$i$i$i|0))|0);
              $$hold$54$i$i$i = $1181 ? $1182 : $hold$54$i$i$i;
              $1183 = HEAP32[$215>>2]|0;
              $1184 = ($$hold$54$i$i$i|0)==($1183|0);
              if ($1184) {
               $bits$55$i$i$i = 0;$have$59$i$i$i = $have$58$i$i$i;$hold$55$i$i$i = 0;$next$59$i$i$i = $next$58$i$i$i;$out$1$i$i$i = $left$0$i$i$i;$zs$i$i$sroa$47$2 = $1170;
               break;
              }
              HEAP32[$193>>2] = 29;
              $bits$0$i$i$i$be = $bits$54$i$i$i;$have$0$i$i$i$be = $have$58$i$i$i;$hold$0$i$i$i$be = $hold$54$i$i$i;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$58$i$i$i;$out$0$i$i$i$be = $left$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $1170;
              break L126;
             }
            } while(0);
            HEAP32[$193>>2] = 27;
            $1186 = $1158;$bits$56$i$i$i = $bits$55$i$i$i;$have$60$i$i$i = $have$59$i$i$i;$hold$56$i$i$i = $hold$55$i$i$i;$next$60$i$i$i = $next$59$i$i$i;$out$2$i$i$i = $out$1$i$i$i;$zs$i$i$sroa$47$3 = $zs$i$i$sroa$47$2;
            label = 411;
            break;
           }
           case 27:  {
            $$pre863 = HEAP32[$197>>2]|0;
            $1186 = $$pre863;$bits$56$i$i$i = $bits$0$i$i$i;$have$60$i$i$i = $have$0$i$i$i;$hold$56$i$i$i = $hold$0$i$i$i;$next$60$i$i$i = $next$0$i$i$i;$out$2$i$i$i = $out$0$i$i$i;$zs$i$i$sroa$47$3 = $zs$i$i$sroa$47$1;
            label = 411;
            break;
           }
           default: {
            $zs$i$i$sroa$47$5$ph = $zs$i$i$sroa$47$1;
            label = 442;
            break L116;
           }
           }
          } while(0);
          do {
           if ((label|0) == 116) {
            while(1) {
             label = 0;
             $308 = ($bits$4$i$i$i>>>0)<(32);
             if (!($308)) {
              break;
             }
             $309 = ($have$4$i$i$i|0)==(0);
             if ($309) {
              $bits$61$i$i$i = $bits$4$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$4$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$4$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$0$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
              break L124;
             }
             $310 = (($bits$4$i$i$i) + 8)|0;
             $311 = HEAP8[$next$4$i$i$i>>0]|0;
             $312 = $311&255;
             $313 = $312 << $bits$4$i$i$i;
             $314 = (($hold$4$i$i$i) + ($313))|0;
             $315 = ((($next$4$i$i$i)) + 1|0);
             $316 = (($have$4$i$i$i) + -1)|0;
             $bits$4$i$i$i = $310;$have$4$i$i$i = $316;$hold$4$i$i$i = $314;$next$4$i$i$i = $315;
             label = 116;
            }
            $317 = HEAP32[$205>>2]|0;
            $318 = ($317|0)==(0|0);
            if (!($318)) {
             $319 = ((($317)) + 4|0);
             HEAP32[$319>>2] = $hold$4$i$i$i;
            }
            $320 = HEAP32[$214>>2]|0;
            $321 = $320 & 512;
            $322 = ($321|0)==(0);
            if (!($322)) {
             $323 = $hold$4$i$i$i&255;
             HEAP8[$hbuf$i$i$i>>0] = $323;
             $324 = $hold$4$i$i$i >>> 8;
             $325 = $324&255;
             HEAP8[$216>>0] = $325;
             $326 = $hold$4$i$i$i >>> 16;
             $327 = $326&255;
             HEAP8[$229>>0] = $327;
             $328 = $hold$4$i$i$i >>> 24;
             $329 = $328&255;
             HEAP8[$230>>0] = $329;
             $330 = HEAP32[$215>>2]|0;
             $331 = (_crc32($330,$hbuf$i$i$i,4)|0);
             HEAP32[$215>>2] = $331;
            }
            HEAP32[$193>>2] = 3;
            $bits$6$i$i$i = 0;$have$6$i$i$i = $have$4$i$i$i;$hold$6$i$i$i = 0;$next$6$i$i$i = $next$4$i$i$i;
            label = 124;
           }
           else if ((label|0) == 192) {
            label = 0;
            $509 = HEAP32[$203>>2]|0;
            $510 = ($509|0)==(0);
            if ($510) {
             label = 193;
             break L116;
            }
            HEAP32[$215>>2] = 1;
            HEAP32[$193>>2] = 11;
            $bits$19$i$i$i = $bits$17$i$i$i;$have$23$i$i$i = $have$21$i$i$i;$hold$19$i$i$i = $hold$17$i$i$i;$next$23$i$i$i = $next$21$i$i$i;
            label = 195;
           }
           else if ((label|0) == 214) {
            label = 0;
            HEAP32[$193>>2] = 15;
            $bits$23$i$i$i = $bits$22$i$i$i;$have$27$i$i$i = $have$26$i$i$i;$hold$23$i$i$i = $hold$22$i$i$i;$next$27$i$i$i = $next$26$i$i$i;
            label = 215;
           }
           else if ((label|0) == 225) {
            label = 0;
            $579 = $$pre864;$bits$26$i$i$i = $bits$26$i$i$i$ph;$have$30$i$i$i = $have$30$i$i$i$ph;$hold$26$i$i$i = $hold$26$i$i$i$ph;$next$30$i$i$i = $next$30$i$i$i$ph;
            while(1) {
             $578 = ($579>>>0)<($$pre865>>>0);
             if ($578) {
              $bits$27$i$i$i = $bits$26$i$i$i;$have$31$i$i$i = $have$30$i$i$i;$hold$27$i$i$i = $hold$26$i$i$i;$next$31$i$i$i = $next$30$i$i$i;
             } else {
              $599 = $579;
              break;
             }
             while(1) {
              $580 = ($bits$27$i$i$i>>>0)<(3);
              if (!($580)) {
               break;
              }
              $581 = ($have$31$i$i$i|0)==(0);
              if ($581) {
               $bits$61$i$i$i = $bits$27$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$27$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$31$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$0$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
               break L124;
              }
              $582 = (($bits$27$i$i$i) + 8)|0;
              $583 = HEAP8[$next$31$i$i$i>>0]|0;
              $584 = $583&255;
              $585 = $584 << $bits$27$i$i$i;
              $586 = (($hold$27$i$i$i) + ($585))|0;
              $587 = ((($next$31$i$i$i)) + 1|0);
              $588 = (($have$31$i$i$i) + -1)|0;
              $bits$27$i$i$i = $582;$have$31$i$i$i = $588;$hold$27$i$i$i = $586;$next$31$i$i$i = $587;
             }
             $589 = $hold$27$i$i$i & 7;
             $590 = $589&65535;
             $591 = (($579) + 1)|0;
             HEAP32[$220>>2] = $591;
             $592 = (11672 + ($579<<1)|0);
             $593 = HEAP16[$592>>1]|0;
             $594 = $593&65535;
             $595 = (((($193)) + 112|0) + ($594<<1)|0);
             HEAP16[$595>>1] = $590;
             $596 = (($bits$27$i$i$i) + -3)|0;
             $597 = $hold$27$i$i$i >>> 3;
             $579 = $591;$bits$26$i$i$i = $596;$have$30$i$i$i = $have$31$i$i$i;$hold$26$i$i$i = $597;$next$30$i$i$i = $next$31$i$i$i;
            }
            while(1) {
             $598 = ($599>>>0)<(19);
             if (!($598)) {
              break;
             }
             $600 = (($599) + 1)|0;
             HEAP32[$220>>2] = $600;
             $601 = (11672 + ($599<<1)|0);
             $602 = HEAP16[$601>>1]|0;
             $603 = $602&65535;
             $604 = (((($193)) + 112|0) + ($603<<1)|0);
             HEAP16[$604>>1] = 0;
             $599 = $600;
            }
            HEAP32[$209>>2] = $208;
            HEAP32[$211>>2] = $$cast$i$i$i;
            HEAP32[$218>>2] = 7;
            $605 = (_inflate_table(0,$224,19,$209,$218,$225)|0);
            $606 = ($605|0)==(0);
            if ($606) {
             HEAP32[$220>>2] = 0;
             HEAP32[$193>>2] = 18;
             $bits$28$i$i$i = $bits$26$i$i$i;$have$32$i$i$i = $have$30$i$i$i;$hold$28$i$i$i = $hold$26$i$i$i;$next$32$i$i$i = $next$30$i$i$i;$ret$1$i$i$i = 0;
             label = 236;
             break;
            } else {
             HEAP32[$193>>2] = 29;
             $bits$0$i$i$i$be = $bits$26$i$i$i;$have$0$i$i$i$be = $have$30$i$i$i;$hold$0$i$i$i$be = $hold$26$i$i$i;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$30$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $605;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
             break;
            }
           }
           else if ((label|0) == 411) {
            label = 0;
            $1185 = ($1186|0)==(0);
            if ($1185) {
             $bits$58$i$i$i = $bits$56$i$i$i;$have$62$i$i$i = $have$60$i$i$i;$hold$58$i$i$i = $hold$56$i$i$i;$next$62$i$i$i = $next$60$i$i$i;
             label = 418;
             break L124;
            }
            $1187 = HEAP32[$214>>2]|0;
            $1188 = ($1187|0)==(0);
            if ($1188) {
             $bits$58$i$i$i = $bits$56$i$i$i;$have$62$i$i$i = $have$60$i$i$i;$hold$58$i$i$i = $hold$56$i$i$i;$next$62$i$i$i = $next$60$i$i$i;
             label = 418;
             break L124;
            } else {
             $bits$57$i$i$i = $bits$56$i$i$i;$have$61$i$i$i = $have$60$i$i$i;$hold$57$i$i$i = $hold$56$i$i$i;$next$61$i$i$i = $next$60$i$i$i;
            }
            while(1) {
             $1189 = ($bits$57$i$i$i>>>0)<(32);
             if (!($1189)) {
              break;
             }
             $1190 = ($have$61$i$i$i|0)==(0);
             if ($1190) {
              $bits$61$i$i$i = $bits$57$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$57$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$61$i$i$i;$out$5$i$i$i = $out$2$i$i$i;$ret$9$i$i$i = $ret$0$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$3;
              break L124;
             }
             $1191 = (($bits$57$i$i$i) + 8)|0;
             $1192 = HEAP8[$next$61$i$i$i>>0]|0;
             $1193 = $1192&255;
             $1194 = $1193 << $bits$57$i$i$i;
             $1195 = (($hold$57$i$i$i) + ($1194))|0;
             $1196 = ((($next$61$i$i$i)) + 1|0);
             $1197 = (($have$61$i$i$i) + -1)|0;
             $bits$57$i$i$i = $1191;$have$61$i$i$i = $1197;$hold$57$i$i$i = $1195;$next$61$i$i$i = $1196;
            }
            $1198 = HEAP32[$201>>2]|0;
            $1199 = ($hold$57$i$i$i|0)==($1198|0);
            if ($1199) {
             $bits$58$i$i$i = 0;$have$62$i$i$i = $have$61$i$i$i;$hold$58$i$i$i = 0;$next$62$i$i$i = $next$61$i$i$i;
             label = 418;
             break L124;
            }
            HEAP32[$193>>2] = 29;
            $bits$0$i$i$i$be = $bits$57$i$i$i;$have$0$i$i$i$be = $have$61$i$i$i;$hold$0$i$i$i$be = $hold$57$i$i$i;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$61$i$i$i;$out$0$i$i$i$be = $out$2$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$3;
           }
          } while(0);
          do {
           if ((label|0) == 124) {
            while(1) {
             label = 0;
             $332 = ($bits$6$i$i$i>>>0)<(16);
             if (!($332)) {
              break;
             }
             $333 = ($have$6$i$i$i|0)==(0);
             if ($333) {
              $bits$61$i$i$i = $bits$6$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$6$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$6$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$0$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
              break L124;
             }
             $334 = (($bits$6$i$i$i) + 8)|0;
             $335 = HEAP8[$next$6$i$i$i>>0]|0;
             $336 = $335&255;
             $337 = $336 << $bits$6$i$i$i;
             $338 = (($hold$6$i$i$i) + ($337))|0;
             $339 = ((($next$6$i$i$i)) + 1|0);
             $340 = (($have$6$i$i$i) + -1)|0;
             $bits$6$i$i$i = $334;$have$6$i$i$i = $340;$hold$6$i$i$i = $338;$next$6$i$i$i = $339;
             label = 124;
            }
            $341 = HEAP32[$205>>2]|0;
            $342 = ($341|0)==(0|0);
            if (!($342)) {
             $343 = $hold$6$i$i$i & 255;
             $344 = ((($341)) + 8|0);
             HEAP32[$344>>2] = $343;
             $345 = $hold$6$i$i$i >>> 8;
             $346 = HEAP32[$205>>2]|0;
             $347 = ((($346)) + 12|0);
             HEAP32[$347>>2] = $345;
            }
            $348 = HEAP32[$214>>2]|0;
            $349 = $348 & 512;
            $350 = ($349|0)==(0);
            if (!($350)) {
             $351 = $hold$6$i$i$i&255;
             HEAP8[$hbuf$i$i$i>>0] = $351;
             $352 = $hold$6$i$i$i >>> 8;
             $353 = $352&255;
             HEAP8[$216>>0] = $353;
             $354 = HEAP32[$215>>2]|0;
             $355 = (_crc32($354,$hbuf$i$i$i,2)|0);
             HEAP32[$215>>2] = $355;
            }
            HEAP32[$193>>2] = 4;
            $bits$7$i$i$i = 0;$have$7$i$i$i = $have$6$i$i$i;$hold$7$i$i$i = 0;$next$7$i$i$i = $next$6$i$i$i;
            label = 132;
           }
           else if ((label|0) == 195) {
            label = 0;
            $511 = HEAP32[$202>>2]|0;
            $512 = ($511|0)==(0);
            if ($512) {
             $bits$20$i$i$i = $bits$19$i$i$i;$have$24$i$i$i = $have$23$i$i$i;$hold$20$i$i$i = $hold$19$i$i$i;$next$24$i$i$i = $next$23$i$i$i;
            } else {
             $513 = $bits$19$i$i$i & -8;
             $514 = $bits$19$i$i$i & 7;
             $515 = $hold$19$i$i$i >>> $514;
             HEAP32[$193>>2] = 26;
             $bits$0$i$i$i$be = $513;$have$0$i$i$i$be = $have$23$i$i$i;$hold$0$i$i$i$be = $515;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$23$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
             break;
            }
            while(1) {
             $516 = ($bits$20$i$i$i>>>0)<(3);
             if (!($516)) {
              break;
             }
             $517 = ($have$24$i$i$i|0)==(0);
             if ($517) {
              $bits$61$i$i$i = $bits$20$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$20$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$24$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$0$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
              break L124;
             }
             $518 = (($bits$20$i$i$i) + 8)|0;
             $519 = HEAP8[$next$24$i$i$i>>0]|0;
             $520 = $519&255;
             $521 = $520 << $bits$20$i$i$i;
             $522 = (($hold$20$i$i$i) + ($521))|0;
             $523 = ((($next$24$i$i$i)) + 1|0);
             $524 = (($have$24$i$i$i) + -1)|0;
             $bits$20$i$i$i = $518;$have$24$i$i$i = $524;$hold$20$i$i$i = $522;$next$24$i$i$i = $523;
            }
            $525 = $hold$20$i$i$i & 1;
            HEAP32[$202>>2] = $525;
            $526 = $hold$20$i$i$i >>> 1;
            $527 = $526 & 3;
            switch ($527|0) {
            case 0:  {
             HEAP32[$193>>2] = 13;
             break;
            }
            case 1:  {
             HEAP32[$211>>2] = 9496;
             HEAP32[$218>>2] = 9;
             HEAP32[$210>>2] = 11544;
             HEAP32[$219>>2] = 5;
             HEAP32[$193>>2] = 19;
             break;
            }
            case 2:  {
             HEAP32[$193>>2] = 16;
             break;
            }
            case 3:  {
             HEAP32[$193>>2] = 29;
             break;
            }
            default: {
             label = 205;
             break L116;
            }
            }
            $528 = (($bits$20$i$i$i) + -3)|0;
            $529 = $hold$20$i$i$i >>> 3;
            $bits$0$i$i$i$be = $528;$have$0$i$i$i$be = $have$24$i$i$i;$hold$0$i$i$i$be = $529;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$24$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
           }
           else if ((label|0) == 215) {
            label = 0;
            $546 = HEAP32[$217>>2]|0;
            $547 = ($546|0)==(0);
            if ($547) {
             HEAP32[$193>>2] = 11;
             $bits$0$i$i$i$be = $bits$23$i$i$i;$have$0$i$i$i$be = $have$27$i$i$i;$hold$0$i$i$i$be = $hold$23$i$i$i;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$27$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
             break;
            }
            $548 = ($546>>>0)>($have$27$i$i$i>>>0);
            $have$27$i$i$i$ = $548 ? $have$27$i$i$i : $546;
            $549 = ($have$27$i$i$i$>>>0)>($left$0$i$i$i>>>0);
            $copy$4$i$i$i = $549 ? $left$0$i$i$i : $have$27$i$i$i$;
            $550 = ($copy$4$i$i$i|0)==(0);
            if ($550) {
             $bits$61$i$i$i$ph = $bits$23$i$i$i;$have$65$i$i$i$ph = $have$27$i$i$i;$hold$61$i$i$i$ph = $hold$23$i$i$i;$left$0$i$i$i$lcssa660 = $left$0$i$i$i;$next$65$i$i$i$ph = $next$27$i$i$i;$ret$9$i$i$i$ph = $ret$0$i$i$i;
             label = 419;
             break L124;
            }
            _memcpy(($put$0$i$i$i|0),($next$27$i$i$i|0),($copy$4$i$i$i|0))|0;
            $551 = (($have$27$i$i$i) - ($copy$4$i$i$i))|0;
            $552 = (($next$27$i$i$i) + ($copy$4$i$i$i)|0);
            $553 = (($left$0$i$i$i) - ($copy$4$i$i$i))|0;
            $554 = (($put$0$i$i$i) + ($copy$4$i$i$i)|0);
            $555 = HEAP32[$217>>2]|0;
            $556 = (($555) - ($copy$4$i$i$i))|0;
            HEAP32[$217>>2] = $556;
            $bits$0$i$i$i$be = $bits$23$i$i$i;$have$0$i$i$i$be = $551;$hold$0$i$i$i$be = $hold$23$i$i$i;$left$0$i$i$i$be = $553;$next$0$i$i$i$be = $552;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $554;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
           }
           else if ((label|0) == 236) {
            label = 0;
            $bits$29$i$i$i = $bits$28$i$i$i;$have$33$i$i$i = $have$32$i$i$i;$hold$29$i$i$i = $hold$28$i$i$i;$next$33$i$i$i = $next$32$i$i$i;
            L285: while(1) {
             $607 = HEAP32[$220>>2]|0;
             $608 = HEAP32[$221>>2]|0;
             $609 = HEAP32[$222>>2]|0;
             $610 = (($608) + ($609))|0;
             $611 = ($607>>>0)<($610>>>0);
             if (!($611)) {
              label = 267;
              break;
             }
             $612 = HEAP32[$218>>2]|0;
             $613 = 1 << $612;
             $614 = (($613) + -1)|0;
             $615 = HEAP32[$211>>2]|0;
             $bits$30$i$i$i = $bits$29$i$i$i;$have$34$i$i$i = $have$33$i$i$i;$hold$30$i$i$i = $hold$29$i$i$i;$next$34$i$i$i = $next$33$i$i$i;
             while(1) {
              $616 = $hold$30$i$i$i & $614;
              $617 = (($615) + ($616<<2)|0);
              $618 = HEAPU16[$617>>1]|(HEAPU16[$617+2>>1]<<16);
              $619 = $618 >>> 8;
              $620 = $619 & 255;
              $621 = ($bits$30$i$i$i>>>0)<($620>>>0);
              if (!($621)) {
               break;
              }
              $625 = ($have$34$i$i$i|0)==(0);
              if ($625) {
               $bits$61$i$i$i = $bits$30$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$30$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$34$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$1$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
               break L124;
              }
              $626 = (($bits$30$i$i$i) + 8)|0;
              $627 = HEAP8[$next$34$i$i$i>>0]|0;
              $628 = $627&255;
              $629 = $628 << $bits$30$i$i$i;
              $630 = (($hold$30$i$i$i) + ($629))|0;
              $631 = ((($next$34$i$i$i)) + 1|0);
              $632 = (($have$34$i$i$i) + -1)|0;
              $bits$30$i$i$i = $626;$have$34$i$i$i = $632;$hold$30$i$i$i = $630;$next$34$i$i$i = $631;
             }
             $622 = $618 >>> 16;
             $623 = $622&65535;
             $624 = ($623&65535)<(16);
             if ($624) {
              $633 = (($bits$30$i$i$i) - ($620))|0;
              $634 = $hold$30$i$i$i >>> $620;
              $635 = (($607) + 1)|0;
              HEAP32[$220>>2] = $635;
              $636 = (((($193)) + 112|0) + ($607<<1)|0);
              HEAP16[$636>>1] = $623;
              $bits$29$i$i$i = $633;$have$33$i$i$i = $have$34$i$i$i;$hold$29$i$i$i = $634;$next$33$i$i$i = $next$34$i$i$i;
              continue;
             }
             switch ($623<<16>>16) {
             case 16:  {
              $637 = (($620) + 2)|0;
              $bits$31$i$i$i = $bits$30$i$i$i;$have$35$i$i$i = $have$34$i$i$i;$hold$31$i$i$i = $hold$30$i$i$i;$next$35$i$i$i = $next$34$i$i$i;
              while(1) {
               $638 = ($bits$31$i$i$i>>>0)<($637>>>0);
               if (!($638)) {
                break;
               }
               $639 = ($have$35$i$i$i|0)==(0);
               if ($639) {
                $bits$61$i$i$i = $bits$31$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$31$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$35$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$1$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
                break L124;
               }
               $640 = (($bits$31$i$i$i) + 8)|0;
               $641 = HEAP8[$next$35$i$i$i>>0]|0;
               $642 = $641&255;
               $643 = $642 << $bits$31$i$i$i;
               $644 = (($hold$31$i$i$i) + ($643))|0;
               $645 = ((($next$35$i$i$i)) + 1|0);
               $646 = (($have$35$i$i$i) + -1)|0;
               $bits$31$i$i$i = $640;$have$35$i$i$i = $646;$hold$31$i$i$i = $644;$next$35$i$i$i = $645;
              }
              $647 = $hold$31$i$i$i >>> $620;
              $648 = (($bits$31$i$i$i) - ($620))|0;
              $649 = ($607|0)==(0);
              if ($649) {
               label = 250;
               break L285;
              }
              $650 = (($607) + -1)|0;
              $651 = (((($193)) + 112|0) + ($650<<1)|0);
              $652 = HEAP16[$651>>1]|0;
              $653 = $652&65535;
              $654 = $647 & 3;
              $655 = (($654) + 3)|0;
              $656 = (($648) + -2)|0;
              $657 = $647 >>> 2;
              $bits$35$i$i$i = $656;$copy$6$i$i$i = $655;$have$39$i$i$i = $have$35$i$i$i;$hold$35$i$i$i = $657;$len$1$i$i$i = $653;$next$39$i$i$i = $next$35$i$i$i;
              break;
             }
             case 17:  {
              $659 = (($620) + 3)|0;
              $bits$32$i$i$i = $bits$30$i$i$i;$have$36$i$i$i = $have$34$i$i$i;$hold$32$i$i$i = $hold$30$i$i$i;$next$36$i$i$i = $next$34$i$i$i;
              while(1) {
               $660 = ($bits$32$i$i$i>>>0)<($659>>>0);
               if (!($660)) {
                break;
               }
               $661 = ($have$36$i$i$i|0)==(0);
               if ($661) {
                $bits$61$i$i$i = $bits$32$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$32$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$36$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$1$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
                break L124;
               }
               $662 = (($bits$32$i$i$i) + 8)|0;
               $663 = HEAP8[$next$36$i$i$i>>0]|0;
               $664 = $663&255;
               $665 = $664 << $bits$32$i$i$i;
               $666 = (($hold$32$i$i$i) + ($665))|0;
               $667 = ((($next$36$i$i$i)) + 1|0);
               $668 = (($have$36$i$i$i) + -1)|0;
               $bits$32$i$i$i = $662;$have$36$i$i$i = $668;$hold$32$i$i$i = $666;$next$36$i$i$i = $667;
              }
              $669 = $hold$32$i$i$i >>> $620;
              $670 = (($bits$32$i$i$i) - ($620))|0;
              $671 = $669 & 7;
              $672 = (($671) + 3)|0;
              $673 = (($670) + -3)|0;
              $674 = $669 >>> 3;
              $bits$35$i$i$i = $673;$copy$6$i$i$i = $672;$have$39$i$i$i = $have$36$i$i$i;$hold$35$i$i$i = $674;$len$1$i$i$i = 0;$next$39$i$i$i = $next$36$i$i$i;
              break;
             }
             default: {
              $658 = (($620) + 7)|0;
              $bits$33$i$i$i = $bits$30$i$i$i;$have$37$i$i$i = $have$34$i$i$i;$hold$33$i$i$i = $hold$30$i$i$i;$next$37$i$i$i = $next$34$i$i$i;
              while(1) {
               $675 = ($bits$33$i$i$i>>>0)<($658>>>0);
               if (!($675)) {
                break;
               }
               $676 = ($have$37$i$i$i|0)==(0);
               if ($676) {
                $bits$61$i$i$i = $bits$33$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$33$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$37$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$1$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
                break L124;
               }
               $677 = (($bits$33$i$i$i) + 8)|0;
               $678 = HEAP8[$next$37$i$i$i>>0]|0;
               $679 = $678&255;
               $680 = $679 << $bits$33$i$i$i;
               $681 = (($hold$33$i$i$i) + ($680))|0;
               $682 = ((($next$37$i$i$i)) + 1|0);
               $683 = (($have$37$i$i$i) + -1)|0;
               $bits$33$i$i$i = $677;$have$37$i$i$i = $683;$hold$33$i$i$i = $681;$next$37$i$i$i = $682;
              }
              $684 = $hold$33$i$i$i >>> $620;
              $685 = (($bits$33$i$i$i) - ($620))|0;
              $686 = $684 & 127;
              $687 = (($686) + 11)|0;
              $688 = (($685) + -7)|0;
              $689 = $684 >>> 7;
              $bits$35$i$i$i = $688;$copy$6$i$i$i = $687;$have$39$i$i$i = $have$37$i$i$i;$hold$35$i$i$i = $689;$len$1$i$i$i = 0;$next$39$i$i$i = $next$37$i$i$i;
             }
             }
             $690 = (($607) + ($copy$6$i$i$i))|0;
             $691 = ($690>>>0)>($610>>>0);
             if ($691) {
              label = 264;
              break;
             }
             $692 = $len$1$i$i$i&65535;
             $copy$7$i$i$i = $copy$6$i$i$i;
             while(1) {
              $693 = ($copy$7$i$i$i|0)==(0);
              if ($693) {
               $bits$29$i$i$i = $bits$35$i$i$i;$have$33$i$i$i = $have$39$i$i$i;$hold$29$i$i$i = $hold$35$i$i$i;$next$33$i$i$i = $next$39$i$i$i;
               continue L285;
              }
              $694 = (($copy$7$i$i$i) + -1)|0;
              $695 = HEAP32[$220>>2]|0;
              $696 = (($695) + 1)|0;
              HEAP32[$220>>2] = $696;
              $697 = (((($193)) + 112|0) + ($695<<1)|0);
              HEAP16[$697>>1] = $692;
              $copy$7$i$i$i = $694;
             }
            }
            if ((label|0) == 250) {
             label = 0;
             HEAP32[$193>>2] = 29;
             $bits$0$i$i$i$be = $648;$have$0$i$i$i$be = $have$35$i$i$i;$hold$0$i$i$i$be = $647;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$35$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$1$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
             break;
            }
            else if ((label|0) == 264) {
             label = 0;
             HEAP32[$193>>2] = 29;
             $bits$0$i$i$i$be = $bits$35$i$i$i;$have$0$i$i$i$be = $have$39$i$i$i;$hold$0$i$i$i$be = $hold$35$i$i$i;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$39$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$1$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
             break;
            }
            else if ((label|0) == 267) {
             label = 0;
             $$pre866 = HEAP32[$193>>2]|0;
             $698 = ($$pre866|0)==(29);
             if ($698) {
              $bits$0$i$i$i$be = $bits$29$i$i$i;$have$0$i$i$i$be = $have$33$i$i$i;$hold$0$i$i$i$be = $hold$29$i$i$i;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$33$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$1$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
              break;
             }
             $699 = HEAP16[$223>>1]|0;
             $700 = ($699<<16>>16)==(0);
             if ($700) {
              HEAP32[$193>>2] = 29;
              $bits$0$i$i$i$be = $bits$29$i$i$i;$have$0$i$i$i$be = $have$33$i$i$i;$hold$0$i$i$i$be = $hold$29$i$i$i;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$33$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$1$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
              break;
             }
             HEAP32[$209>>2] = $208;
             HEAP32[$211>>2] = $$cast$i$i$i;
             HEAP32[$218>>2] = 9;
             $701 = (_inflate_table(1,$224,$608,$209,$218,$225)|0);
             $702 = ($701|0)==(0);
             if (!($702)) {
              HEAP32[$193>>2] = 29;
              $bits$0$i$i$i$be = $bits$29$i$i$i;$have$0$i$i$i$be = $have$33$i$i$i;$hold$0$i$i$i$be = $hold$29$i$i$i;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$33$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $701;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
              break;
             }
             $703 = HEAP32[$209>>2]|0;
             HEAP32[$210>>2] = $703;
             HEAP32[$219>>2] = 6;
             $704 = HEAP32[$221>>2]|0;
             $705 = (((($193)) + 112|0) + ($704<<1)|0);
             $706 = HEAP32[$222>>2]|0;
             $707 = (_inflate_table(2,$705,$706,$209,$219,$225)|0);
             $708 = ($707|0)==(0);
             if ($708) {
              HEAP32[$193>>2] = 19;
              $bits$38$i$i$i = $bits$29$i$i$i;$have$42$i$i$i = $have$33$i$i$i;$hold$38$i$i$i = $hold$29$i$i$i;$next$42$i$i$i = $next$33$i$i$i;$ret$2$i$i$i = 0;
              label = 275;
              break;
             } else {
              HEAP32[$193>>2] = 29;
              $bits$0$i$i$i$be = $bits$29$i$i$i;$have$0$i$i$i$be = $have$33$i$i$i;$hold$0$i$i$i$be = $hold$29$i$i$i;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$33$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $707;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
              break;
             }
            }
           }
          } while(0);
          if ((label|0) == 132) {
           label = 0;
           $356 = HEAP32[$214>>2]|0;
           $357 = $356 & 1024;
           $358 = ($357|0)==(0);
           do {
            if ($358) {
             $379 = HEAP32[$205>>2]|0;
             $380 = ($379|0)==(0|0);
             if ($380) {
              $bits$9$i$i$i = $bits$7$i$i$i;$have$9$i$i$i = $have$7$i$i$i;$hold$9$i$i$i = $hold$7$i$i$i;$next$9$i$i$i = $next$7$i$i$i;
              break;
             }
             $381 = ((($379)) + 16|0);
             HEAP32[$381>>2] = 0;
             $bits$9$i$i$i = $bits$7$i$i$i;$have$9$i$i$i = $have$7$i$i$i;$hold$9$i$i$i = $hold$7$i$i$i;$next$9$i$i$i = $next$7$i$i$i;
            } else {
             $bits$8$i$i$i = $bits$7$i$i$i;$have$8$i$i$i = $have$7$i$i$i;$hold$8$i$i$i = $hold$7$i$i$i;$next$8$i$i$i = $next$7$i$i$i;
             while(1) {
              $359 = ($bits$8$i$i$i>>>0)<(16);
              if (!($359)) {
               break;
              }
              $360 = ($have$8$i$i$i|0)==(0);
              if ($360) {
               $bits$61$i$i$i = $bits$8$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$8$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$8$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$0$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
               break L124;
              }
              $361 = (($bits$8$i$i$i) + 8)|0;
              $362 = HEAP8[$next$8$i$i$i>>0]|0;
              $363 = $362&255;
              $364 = $363 << $bits$8$i$i$i;
              $365 = (($hold$8$i$i$i) + ($364))|0;
              $366 = ((($next$8$i$i$i)) + 1|0);
              $367 = (($have$8$i$i$i) + -1)|0;
              $bits$8$i$i$i = $361;$have$8$i$i$i = $367;$hold$8$i$i$i = $365;$next$8$i$i$i = $366;
             }
             HEAP32[$217>>2] = $hold$8$i$i$i;
             $368 = HEAP32[$205>>2]|0;
             $369 = ($368|0)==(0|0);
             if ($369) {
              $372 = $356;
             } else {
              $370 = ((($368)) + 20|0);
              HEAP32[$370>>2] = $hold$8$i$i$i;
              $$pre876 = HEAP32[$214>>2]|0;
              $372 = $$pre876;
             }
             $371 = $372 & 512;
             $373 = ($371|0)==(0);
             if ($373) {
              $bits$9$i$i$i = 0;$have$9$i$i$i = $have$8$i$i$i;$hold$9$i$i$i = 0;$next$9$i$i$i = $next$8$i$i$i;
              break;
             }
             $374 = $hold$8$i$i$i&255;
             HEAP8[$hbuf$i$i$i>>0] = $374;
             $375 = $hold$8$i$i$i >>> 8;
             $376 = $375&255;
             HEAP8[$216>>0] = $376;
             $377 = HEAP32[$215>>2]|0;
             $378 = (_crc32($377,$hbuf$i$i$i,2)|0);
             HEAP32[$215>>2] = $378;
             $bits$9$i$i$i = 0;$have$9$i$i$i = $have$8$i$i$i;$hold$9$i$i$i = 0;$next$9$i$i$i = $next$8$i$i$i;
            }
           } while(0);
           HEAP32[$193>>2] = 5;
           $bits$10$i$i$i = $bits$9$i$i$i;$have$10$i$i$i = $have$9$i$i$i;$hold$10$i$i$i = $hold$9$i$i$i;$next$10$i$i$i = $next$9$i$i$i;
           label = 143;
          }
          else if ((label|0) == 275) {
           label = 0;
           HEAP32[$193>>2] = 20;
           $bits$39$i$i$i = $bits$38$i$i$i;$have$43$i$i$i = $have$42$i$i$i;$hold$39$i$i$i = $hold$38$i$i$i;$next$43$i$i$i = $next$42$i$i$i;$ret$3$i$i$i = $ret$2$i$i$i;
           label = 276;
          }
          do {
           if ((label|0) == 143) {
            label = 0;
            $382 = HEAP32[$214>>2]|0;
            $383 = $382 & 1024;
            $384 = ($383|0)==(0);
            if ($384) {
             $1811 = $382;$have$12$i$i$i = $have$10$i$i$i;$next$12$i$i$i = $next$10$i$i$i;
            } else {
             $385 = HEAP32[$217>>2]|0;
             $386 = ($385>>>0)>($have$10$i$i$i>>>0);
             $have$10$i$i$i$ = $386 ? $have$10$i$i$i : $385;
             $387 = ($have$10$i$i$i$|0)==(0);
             if ($387) {
              $1812 = $382;$412 = $385;$have$11$i$i$i = $have$10$i$i$i;$next$11$i$i$i = $next$10$i$i$i;
             } else {
              $388 = HEAP32[$205>>2]|0;
              $389 = ($388|0)==(0|0);
              do {
               if ($389) {
                $403 = $382;
               } else {
                $390 = ((($388)) + 16|0);
                $391 = HEAP32[$390>>2]|0;
                $392 = ($391|0)==(0|0);
                if ($392) {
                 $403 = $382;
                 break;
                }
                $393 = ((($388)) + 20|0);
                $394 = HEAP32[$393>>2]|0;
                $395 = (($394) - ($385))|0;
                $396 = (($391) + ($395)|0);
                $397 = (($395) + ($have$10$i$i$i$))|0;
                $398 = ((($388)) + 24|0);
                $399 = HEAP32[$398>>2]|0;
                $400 = ($397>>>0)>($399>>>0);
                $401 = (($399) - ($395))|0;
                $$have$10$i$i$i$ = $400 ? $401 : $have$10$i$i$i$;
                _memcpy(($396|0),($next$10$i$i$i|0),($$have$10$i$i$i$|0))|0;
                $$pre877 = HEAP32[$214>>2]|0;
                $403 = $$pre877;
               }
              } while(0);
              $402 = $403 & 512;
              $404 = ($402|0)==(0);
              if (!($404)) {
               $405 = HEAP32[$215>>2]|0;
               $406 = (_crc32($405,$next$10$i$i$i,$have$10$i$i$i$)|0);
               HEAP32[$215>>2] = $406;
              }
              $407 = (($have$10$i$i$i) - ($have$10$i$i$i$))|0;
              $408 = (($next$10$i$i$i) + ($have$10$i$i$i$)|0);
              $409 = HEAP32[$217>>2]|0;
              $410 = (($409) - ($have$10$i$i$i$))|0;
              HEAP32[$217>>2] = $410;
              $1812 = $403;$412 = $410;$have$11$i$i$i = $407;$next$11$i$i$i = $408;
             }
             $411 = ($412|0)==(0);
             if ($411) {
              $1811 = $1812;$have$12$i$i$i = $have$11$i$i$i;$next$12$i$i$i = $next$11$i$i$i;
             } else {
              $bits$61$i$i$i$ph = $bits$10$i$i$i;$have$65$i$i$i$ph = $have$11$i$i$i;$hold$61$i$i$i$ph = $hold$10$i$i$i;$left$0$i$i$i$lcssa660 = $left$0$i$i$i;$next$65$i$i$i$ph = $next$11$i$i$i;$ret$9$i$i$i$ph = $ret$0$i$i$i;
              label = 419;
              break L124;
             }
            }
            HEAP32[$217>>2] = 0;
            HEAP32[$193>>2] = 6;
            $414 = $1811;$bits$11$i$i$i = $bits$10$i$i$i;$have$13$i$i$i = $have$12$i$i$i;$hold$11$i$i$i = $hold$10$i$i$i;$next$13$i$i$i = $next$12$i$i$i;
            label = 153;
           }
           else if ((label|0) == 276) {
            label = 0;
            $709 = ($have$43$i$i$i>>>0)>(5);
            $710 = ($left$0$i$i$i>>>0)>(257);
            $or$cond1620 = $709 & $710;
            if (!($or$cond1620)) {
             HEAP32[$213>>2] = 0;
             $961 = HEAP32[$218>>2]|0;
             $962 = 1 << $961;
             $963 = (($962) + -1)|0;
             $964 = HEAP32[$211>>2]|0;
             $bits$40$i$i$i = $bits$39$i$i$i;$have$44$i$i$i = $have$43$i$i$i;$hold$40$i$i$i = $hold$39$i$i$i;$next$44$i$i$i = $next$43$i$i$i;
             while(1) {
              $965 = $hold$40$i$i$i & $963;
              $966 = (($964) + ($965<<2)|0);
              $967 = HEAPU16[$966>>1]|(HEAPU16[$966+2>>1]<<16);
              $968 = $967 >>> 8;
              $969 = $968 & 255;
              $970 = ($969>>>0)>($bits$40$i$i$i>>>0);
              if (!($970)) {
               break;
              }
              $974 = ($have$44$i$i$i|0)==(0);
              if ($974) {
               $bits$61$i$i$i = $bits$40$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$40$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$44$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$3$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
               break L124;
              }
              $975 = (($bits$40$i$i$i) + 8)|0;
              $976 = HEAP8[$next$44$i$i$i>>0]|0;
              $977 = $976&255;
              $978 = $977 << $bits$40$i$i$i;
              $979 = (($hold$40$i$i$i) + ($978))|0;
              $980 = ((($next$44$i$i$i)) + 1|0);
              $981 = (($have$44$i$i$i) + -1)|0;
              $bits$40$i$i$i = $975;$have$44$i$i$i = $981;$hold$40$i$i$i = $979;$next$44$i$i$i = $980;
             }
             $971 = $967&255;
             $972 = $967 >>> 16;
             $973 = ($971<<24>>24)==(0);
             do {
              if ($973) {
               $1013 = 0;$bits$42$i$i$i = $bits$40$i$i$i;$have$46$i$i$i = $have$44$i$i$i;$here$i$i$i$sroa$0$0 = 0;$here$i$i$i$sroa$18$0 = $968;$here$i$i$i$sroa$32$0 = $972;$hold$42$i$i$i = $hold$40$i$i$i;$next$46$i$i$i = $next$44$i$i$i;
              } else {
               $982 = ($971&255)<(16);
               if (!($982)) {
                $1013 = 0;$bits$42$i$i$i = $bits$40$i$i$i;$have$46$i$i$i = $have$44$i$i$i;$here$i$i$i$sroa$0$0 = $971;$here$i$i$i$sroa$18$0 = $968;$here$i$i$i$sroa$32$0 = $972;$hold$42$i$i$i = $hold$40$i$i$i;$next$46$i$i$i = $next$44$i$i$i;
                break;
               }
               $983 = $967 >>> 16;
               $984 = $967 & 255;
               $985 = (($969) + ($984))|0;
               $986 = 1 << $985;
               $987 = (($986) + -1)|0;
               $bits$41$i$i$i = $bits$40$i$i$i;$have$45$i$i$i = $have$44$i$i$i;$hold$41$i$i$i = $hold$40$i$i$i;$next$45$i$i$i = $next$44$i$i$i;
               while(1) {
                $988 = $hold$41$i$i$i & $987;
                $989 = $988 >>> $969;
                $990 = (($983) + ($989))|0;
                $991 = (($964) + ($990<<2)|0);
                $992 = HEAPU16[$991>>1]|(HEAPU16[$991+2>>1]<<16);
                $993 = $992 >>> 8;
                $994 = $993 & 255;
                $995 = (($969) + ($994))|0;
                $996 = ($995>>>0)>($bits$41$i$i$i>>>0);
                if (!($996)) {
                 break;
                }
                $1001 = ($have$45$i$i$i|0)==(0);
                if ($1001) {
                 $bits$61$i$i$i = $bits$41$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$41$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$45$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$3$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
                 break L124;
                }
                $1002 = (($bits$41$i$i$i) + 8)|0;
                $1003 = HEAP8[$next$45$i$i$i>>0]|0;
                $1004 = $1003&255;
                $1005 = $1004 << $bits$41$i$i$i;
                $1006 = (($hold$41$i$i$i) + ($1005))|0;
                $1007 = ((($next$45$i$i$i)) + 1|0);
                $1008 = (($have$45$i$i$i) + -1)|0;
                $bits$41$i$i$i = $1002;$have$45$i$i$i = $1008;$hold$41$i$i$i = $1006;$next$45$i$i$i = $1007;
               }
               $997 = $992&255;
               $998 = $992 >>> 16;
               $999 = (($bits$41$i$i$i) - ($969))|0;
               $1000 = $hold$41$i$i$i >>> $969;
               HEAP32[$213>>2] = $969;
               $1013 = $969;$bits$42$i$i$i = $999;$have$46$i$i$i = $have$45$i$i$i;$here$i$i$i$sroa$0$0 = $997;$here$i$i$i$sroa$18$0 = $993;$here$i$i$i$sroa$32$0 = $998;$hold$42$i$i$i = $1000;$next$46$i$i$i = $next$45$i$i$i;
              }
             } while(0);
             $1009 = $here$i$i$i$sroa$18$0 & 255;
             $1010 = $hold$42$i$i$i >>> $1009;
             $1011 = (($bits$42$i$i$i) - ($1009))|0;
             $1012 = (($1013) + ($1009))|0;
             HEAP32[$213>>2] = $1012;
             HEAP32[$217>>2] = $here$i$i$i$sroa$32$0;
             $1014 = ($here$i$i$i$sroa$0$0<<24>>24)==(0);
             if ($1014) {
              HEAP32[$193>>2] = 25;
              $bits$0$i$i$i$be = $1011;$have$0$i$i$i$be = $have$46$i$i$i;$hold$0$i$i$i$be = $1010;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$46$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$3$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
              break;
             }
             $1015 = $here$i$i$i$sroa$0$0 & 32;
             $1016 = ($1015<<24>>24)==(0);
             if (!($1016)) {
              HEAP32[$213>>2] = -1;
              HEAP32[$193>>2] = 11;
              $bits$0$i$i$i$be = $1011;$have$0$i$i$i$be = $have$46$i$i$i;$hold$0$i$i$i$be = $1010;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$46$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$3$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
              break;
             }
             $1017 = $here$i$i$i$sroa$0$0 & 64;
             $1018 = ($1017<<24>>24)==(0);
             if ($1018) {
              $1019 = $here$i$i$i$sroa$0$0&255;
              $1020 = $1019 & 15;
              HEAP32[$226>>2] = $1020;
              HEAP32[$193>>2] = 21;
              $1022 = $1020;$bits$43$i$i$i = $1011;$have$47$i$i$i = $have$46$i$i$i;$hold$43$i$i$i = $1010;$next$47$i$i$i = $next$46$i$i$i;$ret$4$i$i$i = $ret$3$i$i$i;
              label = 355;
              break;
             } else {
              HEAP32[$193>>2] = 29;
              $bits$0$i$i$i$be = $1011;$have$0$i$i$i$be = $have$46$i$i$i;$hold$0$i$i$i$be = $1010;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$46$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$3$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
              break;
             }
            }
            HEAP32[$206>>2] = $hold$39$i$i$i;
            HEAP32[$207>>2] = $bits$39$i$i$i;
            $711 = ((($next$43$i$i$i)) + -1|0);
            $712 = (($have$43$i$i$i) + -5)|0;
            $713 = (($711) + ($712)|0);
            $714 = ((($put$0$i$i$i)) + -1|0);
            $715 = (($left$0$i$i$i) - ($out$0$i$i$i))|0;
            $716 = (($714) + ($715)|0);
            $717 = (($left$0$i$i$i) + -257)|0;
            $718 = (($714) + ($717)|0);
            $719 = HEAP32[$198>>2]|0;
            $720 = HEAP32[$199>>2]|0;
            $721 = HEAP32[$200>>2]|0;
            $722 = HEAP32[$196>>2]|0;
            $723 = HEAP32[$211>>2]|0;
            $724 = HEAP32[$210>>2]|0;
            $725 = HEAP32[$218>>2]|0;
            $726 = 1 << $725;
            $727 = (($726) + -1)|0;
            $728 = HEAP32[$219>>2]|0;
            $729 = 1 << $728;
            $730 = (($729) + -1)|0;
            $731 = $716;
            $732 = ((($722)) + -1|0);
            $733 = ($721|0)==(0);
            $734 = (($719) + ($721))|0;
            $735 = (($731) - ($721))|0;
            $bits$0$i$i$i$i = $bits$39$i$i$i;$hold$0$i$i$i$i = $hold$39$i$i$i;$in$0$i$i$i$i = $711;$out$0$i$i$i$i = $714;
            L393: while(1) {
             $736 = ($bits$0$i$i$i$i>>>0)<(15);
             if ($736) {
              $737 = ((($in$0$i$i$i$i)) + 1|0);
              $738 = HEAP8[$737>>0]|0;
              $739 = $738&255;
              $740 = $739 << $bits$0$i$i$i$i;
              $741 = (($hold$0$i$i$i$i) + ($740))|0;
              $742 = (($bits$0$i$i$i$i) + 8)|0;
              $743 = ((($in$0$i$i$i$i)) + 2|0);
              $744 = HEAP8[$743>>0]|0;
              $745 = $744&255;
              $746 = $745 << $742;
              $747 = (($741) + ($746))|0;
              $748 = (($bits$0$i$i$i$i) + 16)|0;
              $bits$1$i$i$i$i = $748;$hold$1$i$i$i$i = $747;$in$1$i$i$i$i = $743;
             } else {
              $bits$1$i$i$i$i = $bits$0$i$i$i$i;$hold$1$i$i$i$i = $hold$0$i$i$i$i;$in$1$i$i$i$i = $in$0$i$i$i$i;
             }
             $749 = $hold$1$i$i$i$i & $727;
             $$pn$i$i$i$i = $749;$bits$2$i$i$i$i = $bits$1$i$i$i$i;$hold$2$i$i$i$i = $hold$1$i$i$i$i;
             while(1) {
              $storemerge$in$in$i$i$i$i = (($723) + ($$pn$i$i$i$i<<2)|0);
              $storemerge$i$i$i$i = HEAPU16[$storemerge$in$in$i$i$i$i>>1]|(HEAPU16[$storemerge$in$in$i$i$i$i+2>>1]<<16);
              $750 = $storemerge$i$i$i$i&255;
              $751 = $storemerge$i$i$i$i >>> 8;
              $752 = $storemerge$i$i$i$i >>> 16;
              $753 = $751 & 255;
              $754 = $hold$2$i$i$i$i >>> $753;
              $755 = (($bits$2$i$i$i$i) - ($753))|0;
              $756 = $storemerge$i$i$i$i & 255;
              $757 = ($750<<24>>24)==(0);
              if ($757) {
               label = 282;
               break;
              }
              $760 = $storemerge$i$i$i$i & 16;
              $761 = ($760|0)==(0);
              if (!($761)) {
               label = 284;
               break;
              }
              $923 = $storemerge$i$i$i$i & 64;
              $924 = ($923|0)==(0);
              if (!($924)) {
               label = 331;
               break L393;
              }
              $925 = 1 << $756;
              $926 = (($925) + -1)|0;
              $927 = $754 & $926;
              $928 = (($752) + ($927))|0;
              $$pn$i$i$i$i = $928;$bits$2$i$i$i$i = $755;$hold$2$i$i$i$i = $754;
             }
             do {
              if ((label|0) == 282) {
               label = 0;
               $758 = $752&255;
               $759 = ((($out$0$i$i$i$i)) + 1|0);
               HEAP8[$759>>0] = $758;
               $bits$9$i$i$i$i = $755;$hold$9$i$i$i$i = $754;$in$7$i$i$i$i = $in$1$i$i$i$i;$out$18$i$i$i$i = $759;
              }
              else if ((label|0) == 284) {
               label = 0;
               $762 = $storemerge$i$i$i$i & 15;
               $763 = ($762|0)==(0);
               if ($763) {
                $bits$4$i$i$i$i = $755;$hold$4$i$i$i$i = $754;$in$3$i$i$i$i = $in$1$i$i$i$i;$len$0$i$i$i$i = $752;
               } else {
                $764 = ($755>>>0)<($762>>>0);
                if ($764) {
                 $765 = ((($in$1$i$i$i$i)) + 1|0);
                 $766 = HEAP8[$765>>0]|0;
                 $767 = $766&255;
                 $768 = $767 << $755;
                 $769 = (($754) + ($768))|0;
                 $770 = (($755) + 8)|0;
                 $bits$3$i$i$i$i = $770;$hold$3$i$i$i$i = $769;$in$2$i$i$i$i = $765;
                } else {
                 $bits$3$i$i$i$i = $755;$hold$3$i$i$i$i = $754;$in$2$i$i$i$i = $in$1$i$i$i$i;
                }
                $771 = 1 << $762;
                $772 = (($771) + -1)|0;
                $773 = $hold$3$i$i$i$i & $772;
                $774 = (($752) + ($773))|0;
                $775 = $hold$3$i$i$i$i >>> $762;
                $776 = (($bits$3$i$i$i$i) - ($762))|0;
                $bits$4$i$i$i$i = $776;$hold$4$i$i$i$i = $775;$in$3$i$i$i$i = $in$2$i$i$i$i;$len$0$i$i$i$i = $774;
               }
               $777 = ($bits$4$i$i$i$i>>>0)<(15);
               if ($777) {
                $778 = ((($in$3$i$i$i$i)) + 1|0);
                $779 = HEAP8[$778>>0]|0;
                $780 = $779&255;
                $781 = $780 << $bits$4$i$i$i$i;
                $782 = (($hold$4$i$i$i$i) + ($781))|0;
                $783 = (($bits$4$i$i$i$i) + 8)|0;
                $784 = ((($in$3$i$i$i$i)) + 2|0);
                $785 = HEAP8[$784>>0]|0;
                $786 = $785&255;
                $787 = $786 << $783;
                $788 = (($782) + ($787))|0;
                $789 = (($bits$4$i$i$i$i) + 16)|0;
                $bits$5$i$i$i$i = $789;$hold$5$i$i$i$i = $788;$in$4$i$i$i$i = $784;
               } else {
                $bits$5$i$i$i$i = $bits$4$i$i$i$i;$hold$5$i$i$i$i = $hold$4$i$i$i$i;$in$4$i$i$i$i = $in$3$i$i$i$i;
               }
               $790 = $hold$5$i$i$i$i & $730;
               $$pn3$i$i$i$i = $790;$bits$6$i$i$i$i = $bits$5$i$i$i$i;$hold$6$i$i$i$i = $hold$5$i$i$i$i;
               while(1) {
                $storemerge2$in$in$i$i$i$i = (($724) + ($$pn3$i$i$i$i<<2)|0);
                $storemerge2$i$i$i$i = HEAPU16[$storemerge2$in$in$i$i$i$i>>1]|(HEAPU16[$storemerge2$in$in$i$i$i$i+2>>1]<<16);
                $791 = $storemerge2$i$i$i$i >>> 8;
                $792 = $storemerge2$i$i$i$i >>> 16;
                $793 = $791 & 255;
                $794 = $hold$6$i$i$i$i >>> $793;
                $795 = (($bits$6$i$i$i$i) - ($793))|0;
                $796 = $storemerge2$i$i$i$i & 255;
                $797 = $storemerge2$i$i$i$i & 16;
                $798 = ($797|0)==(0);
                if (!($798)) {
                 break;
                }
                $917 = $storemerge2$i$i$i$i & 64;
                $918 = ($917|0)==(0);
                if (!($918)) {
                 label = 328;
                 break L393;
                }
                $919 = 1 << $796;
                $920 = (($919) + -1)|0;
                $921 = $794 & $920;
                $922 = (($792) + ($921))|0;
                $$pn3$i$i$i$i = $922;$bits$6$i$i$i$i = $795;$hold$6$i$i$i$i = $794;
               }
               $799 = $storemerge2$i$i$i$i & 15;
               $800 = ($795>>>0)<($799>>>0);
               do {
                if ($800) {
                 $801 = ((($in$4$i$i$i$i)) + 1|0);
                 $802 = HEAP8[$801>>0]|0;
                 $803 = $802&255;
                 $804 = $803 << $795;
                 $805 = (($794) + ($804))|0;
                 $806 = (($795) + 8)|0;
                 $807 = ($806>>>0)<($799>>>0);
                 if (!($807)) {
                  $bits$8$i$i$i$i = $806;$hold$8$i$i$i$i = $805;$in$6$i$i$i$i = $801;
                  break;
                 }
                 $808 = ((($in$4$i$i$i$i)) + 2|0);
                 $809 = HEAP8[$808>>0]|0;
                 $810 = $809&255;
                 $811 = $810 << $806;
                 $812 = (($805) + ($811))|0;
                 $813 = (($795) + 16)|0;
                 $bits$8$i$i$i$i = $813;$hold$8$i$i$i$i = $812;$in$6$i$i$i$i = $808;
                } else {
                 $bits$8$i$i$i$i = $795;$hold$8$i$i$i$i = $794;$in$6$i$i$i$i = $in$4$i$i$i$i;
                }
               } while(0);
               $814 = 1 << $799;
               $815 = (($814) + -1)|0;
               $816 = $hold$8$i$i$i$i & $815;
               $817 = (($792) + ($816))|0;
               $818 = $hold$8$i$i$i$i >>> $799;
               $819 = (($bits$8$i$i$i$i) - ($799))|0;
               $820 = $out$0$i$i$i$i;
               $821 = (($820) - ($731))|0;
               $822 = ($817>>>0)>($821>>>0);
               if (!($822)) {
                $896 = (0 - ($817))|0;
                $897 = (($out$0$i$i$i$i) + ($896)|0);
                $from$11$i$i$i$i = $897;$len$8$i$i$i$i = $len$0$i$i$i$i;$out$14$i$i$i$i = $out$0$i$i$i$i;
                while(1) {
                 $898 = ((($from$11$i$i$i$i)) + 1|0);
                 $899 = HEAP8[$898>>0]|0;
                 $900 = ((($out$14$i$i$i$i)) + 1|0);
                 HEAP8[$900>>0] = $899;
                 $901 = ((($from$11$i$i$i$i)) + 2|0);
                 $902 = HEAP8[$901>>0]|0;
                 $903 = ((($out$14$i$i$i$i)) + 2|0);
                 HEAP8[$903>>0] = $902;
                 $904 = ((($from$11$i$i$i$i)) + 3|0);
                 $905 = HEAP8[$904>>0]|0;
                 $906 = ((($out$14$i$i$i$i)) + 3|0);
                 HEAP8[$906>>0] = $905;
                 $907 = (($len$8$i$i$i$i) + -3)|0;
                 $908 = ($907>>>0)>(2);
                 if ($908) {
                  $from$11$i$i$i$i = $904;$len$8$i$i$i$i = $907;$out$14$i$i$i$i = $906;
                 } else {
                  break;
                 }
                }
                $909 = ($907|0)==(0);
                if ($909) {
                 $bits$9$i$i$i$i = $819;$hold$9$i$i$i$i = $818;$in$7$i$i$i$i = $in$6$i$i$i$i;$out$18$i$i$i$i = $906;
                 break;
                }
                $910 = ((($from$11$i$i$i$i)) + 4|0);
                $911 = HEAP8[$910>>0]|0;
                $912 = ((($out$14$i$i$i$i)) + 4|0);
                HEAP8[$912>>0] = $911;
                $913 = ($907>>>0)>(1);
                if (!($913)) {
                 $bits$9$i$i$i$i = $819;$hold$9$i$i$i$i = $818;$in$7$i$i$i$i = $in$6$i$i$i$i;$out$18$i$i$i$i = $912;
                 break;
                }
                $914 = ((($from$11$i$i$i$i)) + 5|0);
                $915 = HEAP8[$914>>0]|0;
                $916 = ((($out$14$i$i$i$i)) + 5|0);
                HEAP8[$916>>0] = $915;
                $bits$9$i$i$i$i = $819;$hold$9$i$i$i$i = $818;$in$7$i$i$i$i = $in$6$i$i$i$i;$out$18$i$i$i$i = $916;
                break;
               }
               $823 = (($817) - ($821))|0;
               $824 = ($823>>>0)>($720>>>0);
               if ($824) {
                $825 = HEAP32[$212>>2]|0;
                $826 = ($825|0)==(0);
                if (!($826)) {
                 label = 298;
                 break L393;
                }
               }
               do {
                if ($733) {
                 $827 = (($719) - ($823))|0;
                 $828 = (($732) + ($827)|0);
                 $829 = ($len$0$i$i$i$i>>>0)>($823>>>0);
                 if (!($829)) {
                  $from$10$i$i$i$i = $828;$len$7$i$i$i$i = $len$0$i$i$i$i;$out$11$i$i$i$i = $out$0$i$i$i$i;
                  break;
                 }
                 $830 = (($len$0$i$i$i$i) - ($823))|0;
                 $831 = (($816) + ($792))|0;
                 $832 = (($831) - ($820))|0;
                 $from$0$i$i$i$i = $828;$op$0$i$i$i$i = $823;$out$1$i$i$i$i = $out$0$i$i$i$i;
                 while(1) {
                  $833 = ((($from$0$i$i$i$i)) + 1|0);
                  $834 = HEAP8[$833>>0]|0;
                  $835 = ((($out$1$i$i$i$i)) + 1|0);
                  HEAP8[$835>>0] = $834;
                  $836 = (($op$0$i$i$i$i) + -1)|0;
                  $837 = ($836|0)==(0);
                  if ($837) {
                   break;
                  } else {
                   $from$0$i$i$i$i = $833;$op$0$i$i$i$i = $836;$out$1$i$i$i$i = $835;
                  }
                 }
                 $scevgep1611 = (($out$0$i$i$i$i) + ($731)|0);
                 $scevgep1612 = (($scevgep1611) + ($832)|0);
                 $838 = (0 - ($817))|0;
                 $839 = (($scevgep1612) + ($838)|0);
                 $from$10$i$i$i$i = $839;$len$7$i$i$i$i = $830;$out$11$i$i$i$i = $scevgep1612;
                } else {
                 $840 = ($721>>>0)<($823>>>0);
                 if (!($840)) {
                  $864 = (($721) - ($823))|0;
                  $865 = (($732) + ($864)|0);
                  $866 = ($len$0$i$i$i$i>>>0)>($823>>>0);
                  if (!($866)) {
                   $from$10$i$i$i$i = $865;$len$7$i$i$i$i = $len$0$i$i$i$i;$out$11$i$i$i$i = $out$0$i$i$i$i;
                   break;
                  }
                  $867 = (($len$0$i$i$i$i) - ($823))|0;
                  $868 = (($816) + ($792))|0;
                  $869 = (($868) - ($820))|0;
                  $from$6$i$i$i$i = $865;$op$3$i$i$i$i = $823;$out$7$i$i$i$i = $out$0$i$i$i$i;
                  while(1) {
                   $870 = ((($from$6$i$i$i$i)) + 1|0);
                   $871 = HEAP8[$870>>0]|0;
                   $872 = ((($out$7$i$i$i$i)) + 1|0);
                   HEAP8[$872>>0] = $871;
                   $873 = (($op$3$i$i$i$i) + -1)|0;
                   $874 = ($873|0)==(0);
                   if ($874) {
                    break;
                   } else {
                    $from$6$i$i$i$i = $870;$op$3$i$i$i$i = $873;$out$7$i$i$i$i = $872;
                   }
                  }
                  $scevgep = (($out$0$i$i$i$i) + ($731)|0);
                  $scevgep1606 = (($scevgep) + ($869)|0);
                  $875 = (0 - ($817))|0;
                  $876 = (($scevgep1606) + ($875)|0);
                  $from$10$i$i$i$i = $876;$len$7$i$i$i$i = $867;$out$11$i$i$i$i = $scevgep1606;
                  break;
                 }
                 $841 = (($734) - ($823))|0;
                 $842 = (($732) + ($841)|0);
                 $843 = (($823) - ($721))|0;
                 $844 = ($len$0$i$i$i$i>>>0)>($843>>>0);
                 if (!($844)) {
                  $from$10$i$i$i$i = $842;$len$7$i$i$i$i = $len$0$i$i$i$i;$out$11$i$i$i$i = $out$0$i$i$i$i;
                  break;
                 }
                 $845 = (($len$0$i$i$i$i) - ($843))|0;
                 $846 = (($816) + ($792))|0;
                 $847 = (($846) - ($820))|0;
                 $from$2$i$i$i$i = $842;$op$1$i$i$i$i = $843;$out$3$i$i$i$i = $out$0$i$i$i$i;
                 while(1) {
                  $848 = ((($from$2$i$i$i$i)) + 1|0);
                  $849 = HEAP8[$848>>0]|0;
                  $850 = ((($out$3$i$i$i$i)) + 1|0);
                  HEAP8[$850>>0] = $849;
                  $851 = (($op$1$i$i$i$i) + -1)|0;
                  $852 = ($851|0)==(0);
                  if ($852) {
                   break;
                  } else {
                   $from$2$i$i$i$i = $848;$op$1$i$i$i$i = $851;$out$3$i$i$i$i = $850;
                  }
                 }
                 $scevgep1607 = (($out$0$i$i$i$i) + ($735)|0);
                 $scevgep1608 = (($scevgep1607) + ($847)|0);
                 $853 = ($845>>>0)>($721>>>0);
                 if (!($853)) {
                  $from$10$i$i$i$i = $732;$len$7$i$i$i$i = $845;$out$11$i$i$i$i = $scevgep1608;
                  break;
                 }
                 $854 = (($845) - ($721))|0;
                 $855 = (($816) + ($792))|0;
                 $856 = (($855) - ($820))|0;
                 $from$3$i$i$i$i = $732;$op$2$i$i$i$i = $721;$out$4$i$i$i$i = $scevgep1608;
                 while(1) {
                  $857 = ((($from$3$i$i$i$i)) + 1|0);
                  $858 = HEAP8[$857>>0]|0;
                  $859 = ((($out$4$i$i$i$i)) + 1|0);
                  HEAP8[$859>>0] = $858;
                  $860 = (($op$2$i$i$i$i) + -1)|0;
                  $861 = ($860|0)==(0);
                  if ($861) {
                   break;
                  } else {
                   $from$3$i$i$i$i = $857;$op$2$i$i$i$i = $860;$out$4$i$i$i$i = $859;
                  }
                 }
                 $scevgep1609 = (($out$0$i$i$i$i) + ($731)|0);
                 $scevgep1610 = (($scevgep1609) + ($856)|0);
                 $862 = (0 - ($817))|0;
                 $863 = (($scevgep1610) + ($862)|0);
                 $from$10$i$i$i$i = $863;$len$7$i$i$i$i = $854;$out$11$i$i$i$i = $scevgep1610;
                }
               } while(0);
               while(1) {
                $877 = ($len$7$i$i$i$i>>>0)>(2);
                if (!($877)) {
                 break;
                }
                $878 = ((($from$10$i$i$i$i)) + 1|0);
                $879 = HEAP8[$878>>0]|0;
                $880 = ((($out$11$i$i$i$i)) + 1|0);
                HEAP8[$880>>0] = $879;
                $881 = ((($from$10$i$i$i$i)) + 2|0);
                $882 = HEAP8[$881>>0]|0;
                $883 = ((($out$11$i$i$i$i)) + 2|0);
                HEAP8[$883>>0] = $882;
                $884 = ((($from$10$i$i$i$i)) + 3|0);
                $885 = HEAP8[$884>>0]|0;
                $886 = ((($out$11$i$i$i$i)) + 3|0);
                HEAP8[$886>>0] = $885;
                $887 = (($len$7$i$i$i$i) + -3)|0;
                $from$10$i$i$i$i = $884;$len$7$i$i$i$i = $887;$out$11$i$i$i$i = $886;
               }
               $888 = ($len$7$i$i$i$i|0)==(0);
               if ($888) {
                $bits$9$i$i$i$i = $819;$hold$9$i$i$i$i = $818;$in$7$i$i$i$i = $in$6$i$i$i$i;$out$18$i$i$i$i = $out$11$i$i$i$i;
                break;
               }
               $889 = ((($from$10$i$i$i$i)) + 1|0);
               $890 = HEAP8[$889>>0]|0;
               $891 = ((($out$11$i$i$i$i)) + 1|0);
               HEAP8[$891>>0] = $890;
               $892 = ($len$7$i$i$i$i>>>0)>(1);
               if (!($892)) {
                $bits$9$i$i$i$i = $819;$hold$9$i$i$i$i = $818;$in$7$i$i$i$i = $in$6$i$i$i$i;$out$18$i$i$i$i = $891;
                break;
               }
               $893 = ((($from$10$i$i$i$i)) + 2|0);
               $894 = HEAP8[$893>>0]|0;
               $895 = ((($out$11$i$i$i$i)) + 2|0);
               HEAP8[$895>>0] = $894;
               $bits$9$i$i$i$i = $819;$hold$9$i$i$i$i = $818;$in$7$i$i$i$i = $in$6$i$i$i$i;$out$18$i$i$i$i = $895;
              }
             } while(0);
             $931 = ($in$7$i$i$i$i>>>0)<($713>>>0);
             $932 = ($out$18$i$i$i$i>>>0)<($718>>>0);
             $or$cond1621 = $931 & $932;
             if ($or$cond1621) {
              $bits$0$i$i$i$i = $bits$9$i$i$i$i;$hold$0$i$i$i$i = $hold$9$i$i$i$i;$in$0$i$i$i$i = $in$7$i$i$i$i;$out$0$i$i$i$i = $out$18$i$i$i$i;
             } else {
              $bits$10$i$i$i$i = $bits$9$i$i$i$i;$hold$10$i$i$i$i = $hold$9$i$i$i$i;$in$8$i$i$i$i = $in$7$i$i$i$i;$out$19$i$i$i$i = $out$18$i$i$i$i;
              break;
             }
            }
            do {
             if ((label|0) == 298) {
              label = 0;
              HEAP32[$193>>2] = 29;
              $bits$10$i$i$i$i = $819;$hold$10$i$i$i$i = $818;$in$8$i$i$i$i = $in$6$i$i$i$i;$out$19$i$i$i$i = $out$0$i$i$i$i;
             }
             else if ((label|0) == 328) {
              label = 0;
              HEAP32[$193>>2] = 29;
              $bits$10$i$i$i$i = $795;$hold$10$i$i$i$i = $794;$in$8$i$i$i$i = $in$4$i$i$i$i;$out$19$i$i$i$i = $out$0$i$i$i$i;
             }
             else if ((label|0) == 331) {
              label = 0;
              $929 = $storemerge$i$i$i$i & 32;
              $930 = ($929|0)==(0);
              if ($930) {
               HEAP32[$193>>2] = 29;
               $bits$10$i$i$i$i = $755;$hold$10$i$i$i$i = $754;$in$8$i$i$i$i = $in$1$i$i$i$i;$out$19$i$i$i$i = $out$0$i$i$i$i;
               break;
              } else {
               HEAP32[$193>>2] = 11;
               $bits$10$i$i$i$i = $755;$hold$10$i$i$i$i = $754;$in$8$i$i$i$i = $in$1$i$i$i$i;$out$19$i$i$i$i = $out$0$i$i$i$i;
               break;
              }
             }
            } while(0);
            $933 = $bits$10$i$i$i$i >>> 3;
            $934 = (0 - ($933))|0;
            $935 = (($in$8$i$i$i$i) + ($934)|0);
            $936 = $933 << 3;
            $937 = (($bits$10$i$i$i$i) - ($936))|0;
            $938 = 1 << $937;
            $939 = (($938) + -1)|0;
            $940 = $hold$10$i$i$i$i & $939;
            $941 = ((($935)) + 1|0);
            $942 = ((($out$19$i$i$i$i)) + 1|0);
            $943 = ($935>>>0)<($713>>>0);
            $944 = $713;
            $945 = $935;
            $946 = (($944) - ($945))|0;
            $947 = $935;
            $948 = $713;
            $949 = (($948) - ($947))|0;
            $$in1$i$i$i$i = $943 ? $946 : $949;
            $950 = (($$in1$i$i$i$i) + 5)|0;
            $951 = ($out$19$i$i$i$i>>>0)<($718>>>0);
            $952 = $718;
            $953 = $out$19$i$i$i$i;
            $954 = (($952) - ($953))|0;
            $955 = $out$19$i$i$i$i;
            $956 = $718;
            $957 = (($956) - ($955))|0;
            $$in$i$i$i$i = $951 ? $954 : $957;
            $958 = (($$in$i$i$i$i) + 257)|0;
            HEAP32[$206>>2] = $940;
            HEAP32[$207>>2] = $937;
            $959 = HEAP32[$193>>2]|0;
            $960 = ($959|0)==(11);
            if (!($960)) {
             $bits$0$i$i$i$be = $937;$have$0$i$i$i$be = $950;$hold$0$i$i$i$be = $940;$left$0$i$i$i$be = $958;$next$0$i$i$i$be = $941;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $942;$ret$0$i$i$i$be = $ret$3$i$i$i;$zs$i$i$sroa$0$1$be = $941;$zs$i$i$sroa$11$1$be = $950;$zs$i$i$sroa$24$1$be = $942;$zs$i$i$sroa$36$1$be = $958;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
             break;
            }
            HEAP32[$213>>2] = -1;
            $bits$0$i$i$i$be = $937;$have$0$i$i$i$be = $950;$hold$0$i$i$i$be = $940;$left$0$i$i$i$be = $958;$next$0$i$i$i$be = $941;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $942;$ret$0$i$i$i$be = $ret$3$i$i$i;$zs$i$i$sroa$0$1$be = $941;$zs$i$i$sroa$11$1$be = $950;$zs$i$i$sroa$24$1$be = $942;$zs$i$i$sroa$36$1$be = $958;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
           }
          } while(0);
          if ((label|0) == 153) {
           label = 0;
           $413 = $414 & 2048;
           $415 = ($413|0)==(0);
           do {
            if ($415) {
             $442 = HEAP32[$205>>2]|0;
             $443 = ($442|0)==(0|0);
             if ($443) {
              $have$14$i$i$i = $have$13$i$i$i;$next$14$i$i$i = $next$13$i$i$i;
              break;
             }
             $444 = ((($442)) + 28|0);
             HEAP32[$444>>2] = 0;
             $have$14$i$i$i = $have$13$i$i$i;$next$14$i$i$i = $next$13$i$i$i;
            } else {
             $416 = ($have$13$i$i$i|0)==(0);
             if ($416) {
              $bits$61$i$i$i$ph = $bits$11$i$i$i;$have$65$i$i$i$ph = 0;$hold$61$i$i$i$ph = $hold$11$i$i$i;$left$0$i$i$i$lcssa660 = $left$0$i$i$i;$next$65$i$i$i$ph = $next$13$i$i$i;$ret$9$i$i$i$ph = $ret$0$i$i$i;
              label = 419;
              break L124;
             } else {
              $copy$1$i$i$i = 0;
             }
             while(1) {
              $417 = (($copy$1$i$i$i) + 1)|0;
              $418 = (($next$13$i$i$i) + ($copy$1$i$i$i)|0);
              $419 = HEAP8[$418>>0]|0;
              $420 = HEAP32[$205>>2]|0;
              $421 = ($420|0)==(0|0);
              do {
               if (!($421)) {
                $422 = ((($420)) + 28|0);
                $423 = HEAP32[$422>>2]|0;
                $424 = ($423|0)==(0|0);
                if ($424) {
                 break;
                }
                $425 = HEAP32[$217>>2]|0;
                $426 = ((($420)) + 32|0);
                $427 = HEAP32[$426>>2]|0;
                $428 = ($425>>>0)<($427>>>0);
                if (!($428)) {
                 break;
                }
                $429 = (($425) + 1)|0;
                HEAP32[$217>>2] = $429;
                $430 = HEAP32[$422>>2]|0;
                $431 = (($430) + ($425)|0);
                HEAP8[$431>>0] = $419;
               }
              } while(0);
              $432 = ($419<<24>>24)!=(0);
              $433 = ($have$13$i$i$i>>>0)>($417>>>0);
              $or$cond142 = $432 & $433;
              if ($or$cond142) {
               $copy$1$i$i$i = $417;
              } else {
               break;
              }
             }
             $434 = HEAP32[$214>>2]|0;
             $435 = $434 & 512;
             $436 = ($435|0)==(0);
             if (!($436)) {
              $437 = HEAP32[$215>>2]|0;
              $438 = (_crc32($437,$next$13$i$i$i,$417)|0);
              HEAP32[$215>>2] = $438;
             }
             $439 = (($have$13$i$i$i) - ($417))|0;
             $440 = (($next$13$i$i$i) + ($417)|0);
             $441 = ($419<<24>>24)==(0);
             if ($441) {
              $have$14$i$i$i = $439;$next$14$i$i$i = $440;
             } else {
              $bits$61$i$i$i$ph = $bits$11$i$i$i;$have$65$i$i$i$ph = $439;$hold$61$i$i$i$ph = $hold$11$i$i$i;$left$0$i$i$i$lcssa660 = $left$0$i$i$i;$next$65$i$i$i$ph = $440;$ret$9$i$i$i$ph = $ret$0$i$i$i;
              label = 419;
              break L124;
             }
            }
           } while(0);
           HEAP32[$217>>2] = 0;
           HEAP32[$193>>2] = 7;
           $bits$12$i$i$i = $bits$11$i$i$i;$have$15$i$i$i = $have$14$i$i$i;$hold$12$i$i$i = $hold$11$i$i$i;$next$15$i$i$i = $next$14$i$i$i;
           label = 166;
          }
          else if ((label|0) == 355) {
           label = 0;
           $1021 = ($1022|0)==(0);
           if ($1021) {
            $$pre870 = HEAP32[$217>>2]|0;
            $1041 = $$pre870;$bits$45$i$i$i = $bits$43$i$i$i;$have$49$i$i$i = $have$47$i$i$i;$hold$45$i$i$i = $hold$43$i$i$i;$next$49$i$i$i = $next$47$i$i$i;
           } else {
            $bits$44$i$i$i = $bits$43$i$i$i;$have$48$i$i$i = $have$47$i$i$i;$hold$44$i$i$i = $hold$43$i$i$i;$next$48$i$i$i = $next$47$i$i$i;
            while(1) {
             $1023 = ($bits$44$i$i$i>>>0)<($1022>>>0);
             if (!($1023)) {
              break;
             }
             $1024 = ($have$48$i$i$i|0)==(0);
             if ($1024) {
              $bits$61$i$i$i = $bits$44$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$44$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$48$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$4$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
              break L124;
             }
             $1025 = (($bits$44$i$i$i) + 8)|0;
             $1026 = HEAP8[$next$48$i$i$i>>0]|0;
             $1027 = $1026&255;
             $1028 = $1027 << $bits$44$i$i$i;
             $1029 = (($hold$44$i$i$i) + ($1028))|0;
             $1030 = ((($next$48$i$i$i)) + 1|0);
             $1031 = (($have$48$i$i$i) + -1)|0;
             $bits$44$i$i$i = $1025;$have$48$i$i$i = $1031;$hold$44$i$i$i = $1029;$next$48$i$i$i = $1030;
            }
            $1032 = 1 << $1022;
            $1033 = (($1032) + -1)|0;
            $1034 = $hold$44$i$i$i & $1033;
            $1035 = HEAP32[$217>>2]|0;
            $1036 = (($1035) + ($1034))|0;
            HEAP32[$217>>2] = $1036;
            $1037 = (($bits$44$i$i$i) - ($1022))|0;
            $1038 = $hold$44$i$i$i >>> $1022;
            $1039 = HEAP32[$213>>2]|0;
            $1040 = (($1039) + ($1022))|0;
            HEAP32[$213>>2] = $1040;
            $1041 = $1036;$bits$45$i$i$i = $1037;$have$49$i$i$i = $have$48$i$i$i;$hold$45$i$i$i = $1038;$next$49$i$i$i = $next$48$i$i$i;
           }
           HEAP32[$227>>2] = $1041;
           HEAP32[$193>>2] = 22;
           $bits$46$i$i$i = $bits$45$i$i$i;$have$50$i$i$i = $have$49$i$i$i;$hold$46$i$i$i = $hold$45$i$i$i;$next$50$i$i$i = $next$49$i$i$i;$ret$5$i$i$i = $ret$4$i$i$i;
           label = 362;
          }
          do {
           if ((label|0) == 166) {
            label = 0;
            $445 = HEAP32[$214>>2]|0;
            $446 = $445 & 4096;
            $447 = ($446|0)==(0);
            do {
             if ($447) {
              $474 = HEAP32[$205>>2]|0;
              $475 = ($474|0)==(0|0);
              if ($475) {
               $have$16$i$i$i = $have$15$i$i$i;$next$16$i$i$i = $next$15$i$i$i;
               break;
              }
              $476 = ((($474)) + 36|0);
              HEAP32[$476>>2] = 0;
              $have$16$i$i$i = $have$15$i$i$i;$next$16$i$i$i = $next$15$i$i$i;
             } else {
              $448 = ($have$15$i$i$i|0)==(0);
              if ($448) {
               $bits$61$i$i$i$ph = $bits$12$i$i$i;$have$65$i$i$i$ph = 0;$hold$61$i$i$i$ph = $hold$12$i$i$i;$left$0$i$i$i$lcssa660 = $left$0$i$i$i;$next$65$i$i$i$ph = $next$15$i$i$i;$ret$9$i$i$i$ph = $ret$0$i$i$i;
               label = 419;
               break L124;
              } else {
               $copy$2$i$i$i = 0;
              }
              while(1) {
               $449 = (($copy$2$i$i$i) + 1)|0;
               $450 = (($next$15$i$i$i) + ($copy$2$i$i$i)|0);
               $451 = HEAP8[$450>>0]|0;
               $452 = HEAP32[$205>>2]|0;
               $453 = ($452|0)==(0|0);
               do {
                if (!($453)) {
                 $454 = ((($452)) + 36|0);
                 $455 = HEAP32[$454>>2]|0;
                 $456 = ($455|0)==(0|0);
                 if ($456) {
                  break;
                 }
                 $457 = HEAP32[$217>>2]|0;
                 $458 = ((($452)) + 40|0);
                 $459 = HEAP32[$458>>2]|0;
                 $460 = ($457>>>0)<($459>>>0);
                 if (!($460)) {
                  break;
                 }
                 $461 = (($457) + 1)|0;
                 HEAP32[$217>>2] = $461;
                 $462 = HEAP32[$454>>2]|0;
                 $463 = (($462) + ($457)|0);
                 HEAP8[$463>>0] = $451;
                }
               } while(0);
               $464 = ($451<<24>>24)!=(0);
               $465 = ($have$15$i$i$i>>>0)>($449>>>0);
               $or$cond = $464 & $465;
               if ($or$cond) {
                $copy$2$i$i$i = $449;
               } else {
                break;
               }
              }
              $466 = HEAP32[$214>>2]|0;
              $467 = $466 & 512;
              $468 = ($467|0)==(0);
              if (!($468)) {
               $469 = HEAP32[$215>>2]|0;
               $470 = (_crc32($469,$next$15$i$i$i,$449)|0);
               HEAP32[$215>>2] = $470;
              }
              $471 = (($have$15$i$i$i) - ($449))|0;
              $472 = (($next$15$i$i$i) + ($449)|0);
              $473 = ($451<<24>>24)==(0);
              if ($473) {
               $have$16$i$i$i = $471;$next$16$i$i$i = $472;
              } else {
               $bits$61$i$i$i$ph = $bits$12$i$i$i;$have$65$i$i$i$ph = $471;$hold$61$i$i$i$ph = $hold$12$i$i$i;$left$0$i$i$i$lcssa660 = $left$0$i$i$i;$next$65$i$i$i$ph = $472;$ret$9$i$i$i$ph = $ret$0$i$i$i;
               label = 419;
               break L124;
              }
             }
            } while(0);
            HEAP32[$193>>2] = 8;
            $bits$13$i$i$i = $bits$12$i$i$i;$have$17$i$i$i = $have$16$i$i$i;$hold$13$i$i$i = $hold$12$i$i$i;$next$17$i$i$i = $next$16$i$i$i;
            label = 179;
           }
           else if ((label|0) == 362) {
            label = 0;
            $1042 = HEAP32[$219>>2]|0;
            $1043 = 1 << $1042;
            $1044 = (($1043) + -1)|0;
            $1045 = HEAP32[$210>>2]|0;
            $bits$47$i$i$i = $bits$46$i$i$i;$have$51$i$i$i = $have$50$i$i$i;$hold$47$i$i$i = $hold$46$i$i$i;$next$51$i$i$i = $next$50$i$i$i;
            while(1) {
             $1046 = $hold$47$i$i$i & $1044;
             $1047 = (($1045) + ($1046<<2)|0);
             $1048 = HEAPU16[$1047>>1]|(HEAPU16[$1047+2>>1]<<16);
             $1049 = $1048 >>> 8;
             $1050 = $1049 & 255;
             $1051 = ($1050>>>0)>($bits$47$i$i$i>>>0);
             if (!($1051)) {
              break;
             }
             $1054 = ($have$51$i$i$i|0)==(0);
             if ($1054) {
              $bits$61$i$i$i = $bits$47$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$47$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$51$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$5$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
              break L124;
             }
             $1055 = (($bits$47$i$i$i) + 8)|0;
             $1056 = HEAP8[$next$51$i$i$i>>0]|0;
             $1057 = $1056&255;
             $1058 = $1057 << $bits$47$i$i$i;
             $1059 = (($hold$47$i$i$i) + ($1058))|0;
             $1060 = ((($next$51$i$i$i)) + 1|0);
             $1061 = (($have$51$i$i$i) + -1)|0;
             $bits$47$i$i$i = $1055;$have$51$i$i$i = $1061;$hold$47$i$i$i = $1059;$next$51$i$i$i = $1060;
            }
            $1052 = $1048&255;
            $1053 = ($1052&255)<(16);
            if ($1053) {
             $1062 = $1048 >>> 16;
             $1063 = $1048 & 255;
             $1064 = (($1050) + ($1063))|0;
             $1065 = 1 << $1064;
             $1066 = (($1065) + -1)|0;
             $bits$48$i$i$i = $bits$47$i$i$i;$have$52$i$i$i = $have$51$i$i$i;$hold$48$i$i$i = $hold$47$i$i$i;$next$52$i$i$i = $next$51$i$i$i;
             while(1) {
              $1067 = $hold$48$i$i$i & $1066;
              $1068 = $1067 >>> $1050;
              $1069 = (($1062) + ($1068))|0;
              $1070 = (($1045) + ($1069<<2)|0);
              $1071 = HEAPU16[$1070>>1]|(HEAPU16[$1070+2>>1]<<16);
              $1072 = $1071 >>> 8;
              $1073 = $1072 & 255;
              $1074 = (($1050) + ($1073))|0;
              $1075 = ($1074>>>0)>($bits$48$i$i$i>>>0);
              if (!($1075)) {
               break;
              }
              $1081 = ($have$52$i$i$i|0)==(0);
              if ($1081) {
               $bits$61$i$i$i = $bits$48$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$48$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$52$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$5$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
               break L124;
              }
              $1082 = (($bits$48$i$i$i) + 8)|0;
              $1083 = HEAP8[$next$52$i$i$i>>0]|0;
              $1084 = $1083&255;
              $1085 = $1084 << $bits$48$i$i$i;
              $1086 = (($hold$48$i$i$i) + ($1085))|0;
              $1087 = ((($next$52$i$i$i)) + 1|0);
              $1088 = (($have$52$i$i$i) + -1)|0;
              $bits$48$i$i$i = $1082;$have$52$i$i$i = $1088;$hold$48$i$i$i = $1086;$next$52$i$i$i = $1087;
             }
             $1076 = $1071&255;
             $1077 = (($bits$48$i$i$i) - ($1050))|0;
             $1078 = $hold$48$i$i$i >>> $1050;
             $1079 = HEAP32[$213>>2]|0;
             $1080 = (($1079) + ($1050))|0;
             HEAP32[$213>>2] = $1080;
             $1093 = $1080;$bits$49$i$i$i = $1077;$have$53$i$i$i = $have$52$i$i$i;$here$i$i$i$sroa$0$1 = $1076;$here$i$i$i$sroa$18$1 = $1072;$here$i$i$i$sroa$32$1$in = $1071;$hold$49$i$i$i = $1078;$next$53$i$i$i = $next$52$i$i$i;
            } else {
             $$pre872 = HEAP32[$213>>2]|0;
             $1093 = $$pre872;$bits$49$i$i$i = $bits$47$i$i$i;$have$53$i$i$i = $have$51$i$i$i;$here$i$i$i$sroa$0$1 = $1052;$here$i$i$i$sroa$18$1 = $1049;$here$i$i$i$sroa$32$1$in = $1048;$hold$49$i$i$i = $hold$47$i$i$i;$next$53$i$i$i = $next$51$i$i$i;
            }
            $1089 = $here$i$i$i$sroa$18$1 & 255;
            $1090 = $hold$49$i$i$i >>> $1089;
            $1091 = (($bits$49$i$i$i) - ($1089))|0;
            $1092 = (($1093) + ($1089))|0;
            HEAP32[$213>>2] = $1092;
            $1094 = $here$i$i$i$sroa$0$1 & 64;
            $1095 = ($1094<<24>>24)==(0);
            if ($1095) {
             $here$i$i$i$sroa$32$1 = $here$i$i$i$sroa$32$1$in >>> 16;
             HEAP32[$228>>2] = $here$i$i$i$sroa$32$1;
             $1096 = $here$i$i$i$sroa$0$1&255;
             $1097 = $1096 & 15;
             HEAP32[$226>>2] = $1097;
             HEAP32[$193>>2] = 23;
             $1099 = $1097;$bits$50$i$i$i = $1091;$have$54$i$i$i = $have$53$i$i$i;$hold$50$i$i$i = $1090;$next$54$i$i$i = $next$53$i$i$i;$ret$6$i$i$i = $ret$5$i$i$i;
             label = 376;
             break;
            } else {
             HEAP32[$193>>2] = 29;
             $bits$0$i$i$i$be = $1091;$have$0$i$i$i$be = $have$53$i$i$i;$hold$0$i$i$i$be = $1090;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$53$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$5$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
             break;
            }
           }
          } while(0);
          L536: do {
           if ((label|0) == 179) {
            label = 0;
            $477 = HEAP32[$214>>2]|0;
            $478 = $477 & 512;
            $479 = ($478|0)==(0);
            do {
             if ($479) {
              $bits$15$i$i$i = $bits$13$i$i$i;$have$19$i$i$i = $have$17$i$i$i;$hold$15$i$i$i = $hold$13$i$i$i;$next$19$i$i$i = $next$17$i$i$i;
             } else {
              $bits$14$i$i$i = $bits$13$i$i$i;$have$18$i$i$i = $have$17$i$i$i;$hold$14$i$i$i = $hold$13$i$i$i;$next$18$i$i$i = $next$17$i$i$i;
              while(1) {
               $480 = ($bits$14$i$i$i>>>0)<(16);
               if (!($480)) {
                break;
               }
               $481 = ($have$18$i$i$i|0)==(0);
               if ($481) {
                $bits$61$i$i$i = $bits$14$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$14$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$18$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$0$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
                break L124;
               }
               $482 = (($bits$14$i$i$i) + 8)|0;
               $483 = HEAP8[$next$18$i$i$i>>0]|0;
               $484 = $483&255;
               $485 = $484 << $bits$14$i$i$i;
               $486 = (($hold$14$i$i$i) + ($485))|0;
               $487 = ((($next$18$i$i$i)) + 1|0);
               $488 = (($have$18$i$i$i) + -1)|0;
               $bits$14$i$i$i = $482;$have$18$i$i$i = $488;$hold$14$i$i$i = $486;$next$18$i$i$i = $487;
              }
              $489 = HEAP32[$215>>2]|0;
              $490 = $489 & 65535;
              $491 = ($hold$14$i$i$i|0)==($490|0);
              if ($491) {
               $bits$15$i$i$i = 0;$have$19$i$i$i = $have$18$i$i$i;$hold$15$i$i$i = 0;$next$19$i$i$i = $next$18$i$i$i;
               break;
              }
              HEAP32[$193>>2] = 29;
              $bits$0$i$i$i$be = $bits$14$i$i$i;$have$0$i$i$i$be = $have$18$i$i$i;$hold$0$i$i$i$be = $hold$14$i$i$i;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$18$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
              break L536;
             }
            } while(0);
            $492 = HEAP32[$205>>2]|0;
            $493 = ($492|0)==(0|0);
            if (!($493)) {
             $494 = $477 >>> 9;
             $495 = $494 & 1;
             $496 = ((($492)) + 44|0);
             HEAP32[$496>>2] = $495;
             $497 = HEAP32[$205>>2]|0;
             $498 = ((($497)) + 48|0);
             HEAP32[$498>>2] = 1;
            }
            HEAP32[$215>>2] = 0;
            HEAP32[$193>>2] = 11;
            $bits$0$i$i$i$be = $bits$15$i$i$i;$have$0$i$i$i$be = $have$19$i$i$i;$hold$0$i$i$i$be = $hold$15$i$i$i;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$19$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$0$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
           }
           else if ((label|0) == 376) {
            label = 0;
            $1098 = ($1099|0)==(0);
            if ($1098) {
             $bits$52$i$i$i = $bits$50$i$i$i;$have$56$i$i$i = $have$54$i$i$i;$hold$52$i$i$i = $hold$50$i$i$i;$next$56$i$i$i = $next$54$i$i$i;
            } else {
             $bits$51$i$i$i = $bits$50$i$i$i;$have$55$i$i$i = $have$54$i$i$i;$hold$51$i$i$i = $hold$50$i$i$i;$next$55$i$i$i = $next$54$i$i$i;
             while(1) {
              $1100 = ($bits$51$i$i$i>>>0)<($1099>>>0);
              if (!($1100)) {
               break;
              }
              $1101 = ($have$55$i$i$i|0)==(0);
              if ($1101) {
               $bits$61$i$i$i = $bits$51$i$i$i;$have$65$i$i$i = 0;$hold$61$i$i$i = $hold$51$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$55$i$i$i;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$6$i$i$i;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
               break L124;
              }
              $1102 = (($bits$51$i$i$i) + 8)|0;
              $1103 = HEAP8[$next$55$i$i$i>>0]|0;
              $1104 = $1103&255;
              $1105 = $1104 << $bits$51$i$i$i;
              $1106 = (($hold$51$i$i$i) + ($1105))|0;
              $1107 = ((($next$55$i$i$i)) + 1|0);
              $1108 = (($have$55$i$i$i) + -1)|0;
              $bits$51$i$i$i = $1102;$have$55$i$i$i = $1108;$hold$51$i$i$i = $1106;$next$55$i$i$i = $1107;
             }
             $1109 = 1 << $1099;
             $1110 = (($1109) + -1)|0;
             $1111 = $hold$51$i$i$i & $1110;
             $1112 = HEAP32[$228>>2]|0;
             $1113 = (($1112) + ($1111))|0;
             HEAP32[$228>>2] = $1113;
             $1114 = (($bits$51$i$i$i) - ($1099))|0;
             $1115 = $hold$51$i$i$i >>> $1099;
             $1116 = HEAP32[$213>>2]|0;
             $1117 = (($1116) + ($1099))|0;
             HEAP32[$213>>2] = $1117;
             $bits$52$i$i$i = $1114;$have$56$i$i$i = $have$55$i$i$i;$hold$52$i$i$i = $1115;$next$56$i$i$i = $next$55$i$i$i;
            }
            HEAP32[$193>>2] = 24;
            $bits$53$i$i$i = $bits$52$i$i$i;$have$57$i$i$i = $have$56$i$i$i;$hold$53$i$i$i = $hold$52$i$i$i;$next$57$i$i$i = $next$56$i$i$i;$ret$7$i$i$i = $ret$6$i$i$i;
            label = 382;
           }
          } while(0);
          L557: do {
           if ((label|0) == 382) {
            label = 0;
            $1118 = ($left$0$i$i$i|0)==(0);
            if ($1118) {
             $bits$61$i$i$i$ph = $bits$53$i$i$i;$have$65$i$i$i$ph = $have$57$i$i$i;$hold$61$i$i$i$ph = $hold$53$i$i$i;$left$0$i$i$i$lcssa660 = 0;$next$65$i$i$i$ph = $next$57$i$i$i;$ret$9$i$i$i$ph = $ret$7$i$i$i;
             label = 419;
             break L124;
            }
            $1119 = (($out$0$i$i$i) - ($left$0$i$i$i))|0;
            $1120 = HEAP32[$228>>2]|0;
            $1121 = ($1120>>>0)>($1119>>>0);
            if ($1121) {
             $1122 = (($1120) - ($1119))|0;
             $1123 = HEAP32[$199>>2]|0;
             $1124 = ($1122>>>0)>($1123>>>0);
             do {
              if ($1124) {
               $1125 = HEAP32[$212>>2]|0;
               $1126 = ($1125|0)==(0);
               if ($1126) {
                break;
               }
               HEAP32[$193>>2] = 29;
               $bits$0$i$i$i$be = $bits$53$i$i$i;$have$0$i$i$i$be = $have$57$i$i$i;$hold$0$i$i$i$be = $hold$53$i$i$i;$left$0$i$i$i$be = $left$0$i$i$i;$next$0$i$i$i$be = $next$57$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $put$0$i$i$i;$ret$0$i$i$i$be = $ret$7$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
               break L557;
              }
             } while(0);
             $1127 = HEAP32[$200>>2]|0;
             $1128 = ($1122>>>0)>($1127>>>0);
             if ($1128) {
              $1129 = (($1122) - ($1127))|0;
              $1130 = HEAP32[$196>>2]|0;
              $1131 = HEAP32[$198>>2]|0;
              $1132 = (($1131) - ($1129))|0;
              $1133 = (($1130) + ($1132)|0);
              $copy$8$i$i$i = $1129;$from$0$i$i$i = $1133;
             } else {
              $1134 = HEAP32[$196>>2]|0;
              $1135 = (($1127) - ($1122))|0;
              $1136 = (($1134) + ($1135)|0);
              $copy$8$i$i$i = $1122;$from$0$i$i$i = $1136;
             }
             $1137 = HEAP32[$217>>2]|0;
             $1138 = ($copy$8$i$i$i>>>0)>($1137>>>0);
             $$copy$8$i$i$i = $1138 ? $1137 : $copy$8$i$i$i;
             $1144 = $1137;$copy$10$i$i$i = $$copy$8$i$i$i;$from$1$i$i$i = $from$0$i$i$i;
            } else {
             $1139 = (0 - ($1120))|0;
             $1140 = (($put$0$i$i$i) + ($1139)|0);
             $1141 = HEAP32[$217>>2]|0;
             $1144 = $1141;$copy$10$i$i$i = $1141;$from$1$i$i$i = $1140;
            }
            $1142 = ($copy$10$i$i$i>>>0)>($left$0$i$i$i>>>0);
            $left$0$i$i$i$copy$10$i$i$i = $1142 ? $left$0$i$i$i : $copy$10$i$i$i;
            $1143 = (($1144) - ($left$0$i$i$i$copy$10$i$i$i))|0;
            HEAP32[$217>>2] = $1143;
            $copy$12$i$i$i = $left$0$i$i$i$copy$10$i$i$i;$from$2$i$i$i = $from$1$i$i$i;$put$1$i$i$i = $put$0$i$i$i;
            while(1) {
             $1145 = HEAP8[$from$2$i$i$i>>0]|0;
             $1146 = ((($put$1$i$i$i)) + 1|0);
             HEAP8[$put$1$i$i$i>>0] = $1145;
             $1147 = ((($from$2$i$i$i)) + 1|0);
             $1148 = (($copy$12$i$i$i) + -1)|0;
             $1149 = ($1148|0)==(0);
             if ($1149) {
              break;
             } else {
              $copy$12$i$i$i = $1148;$from$2$i$i$i = $1147;$put$1$i$i$i = $1146;
             }
            }
            $1150 = (($left$0$i$i$i) - ($left$0$i$i$i$copy$10$i$i$i))|0;
            $1151 = HEAP32[$217>>2]|0;
            $1152 = ($1151|0)==(0);
            if (!($1152)) {
             $bits$0$i$i$i$be = $bits$53$i$i$i;$have$0$i$i$i$be = $have$57$i$i$i;$hold$0$i$i$i$be = $hold$53$i$i$i;$left$0$i$i$i$be = $1150;$next$0$i$i$i$be = $next$57$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $1146;$ret$0$i$i$i$be = $ret$7$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
             break;
            }
            HEAP32[$193>>2] = 20;
            $bits$0$i$i$i$be = $bits$53$i$i$i;$have$0$i$i$i$be = $have$57$i$i$i;$hold$0$i$i$i$be = $hold$53$i$i$i;$left$0$i$i$i$be = $1150;$next$0$i$i$i$be = $next$57$i$i$i;$out$0$i$i$i$be = $out$0$i$i$i;$put$0$i$i$i$be = $1146;$ret$0$i$i$i$be = $ret$7$i$i$i;$zs$i$i$sroa$0$1$be = $zs$i$i$sroa$0$1;$zs$i$i$sroa$11$1$be = $zs$i$i$sroa$11$1;$zs$i$i$sroa$24$1$be = $zs$i$i$sroa$24$1;$zs$i$i$sroa$36$1$be = $zs$i$i$sroa$36$1;$zs$i$i$sroa$47$1$be = $zs$i$i$sroa$47$1;
           }
          } while(0);
          $$pre859 = HEAP32[$193>>2]|0;
          $240 = $$pre859;$bits$0$i$i$i = $bits$0$i$i$i$be;$have$0$i$i$i = $have$0$i$i$i$be;$hold$0$i$i$i = $hold$0$i$i$i$be;$left$0$i$i$i = $left$0$i$i$i$be;$next$0$i$i$i = $next$0$i$i$i$be;$out$0$i$i$i = $out$0$i$i$i$be;$put$0$i$i$i = $put$0$i$i$i$be;$ret$0$i$i$i = $ret$0$i$i$i$be;$zs$i$i$sroa$0$1 = $zs$i$i$sroa$0$1$be;$zs$i$i$sroa$11$1 = $zs$i$i$sroa$11$1$be;$zs$i$i$sroa$24$1 = $zs$i$i$sroa$24$1$be;$zs$i$i$sroa$36$1 = $zs$i$i$sroa$36$1$be;$zs$i$i$sroa$47$1 = $zs$i$i$sroa$47$1$be;
         }
         if ((label|0) == 418) {
          label = 0;
          HEAP32[$193>>2] = 28;
          $bits$61$i$i$i = $bits$58$i$i$i;$have$65$i$i$i = $have$62$i$i$i;$hold$61$i$i$i = $hold$58$i$i$i;$left$0$i$i$i688 = $left$0$i$i$i;$next$65$i$i$i = $next$62$i$i$i;$out$5$i$i$i = $out$2$i$i$i;$ret$9$i$i$i = 1;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$3;
         }
         else if ((label|0) == 419) {
          label = 0;
          $bits$61$i$i$i = $bits$61$i$i$i$ph;$have$65$i$i$i = $have$65$i$i$i$ph;$hold$61$i$i$i = $hold$61$i$i$i$ph;$left$0$i$i$i688 = $left$0$i$i$i$lcssa660;$next$65$i$i$i = $next$65$i$i$i$ph;$out$5$i$i$i = $out$0$i$i$i;$ret$9$i$i$i = $ret$9$i$i$i$ph;$zs$i$i$sroa$47$4 = $zs$i$i$sroa$47$1;
         }
         HEAP32[$206>>2] = $hold$61$i$i$i;
         HEAP32[$207>>2] = $bits$61$i$i$i;
         $1200 = HEAP32[$198>>2]|0;
         $1201 = ($1200|0)==(0);
         do {
          if ($1201) {
           $1202 = ($out$5$i$i$i|0)==($left$0$i$i$i688|0);
           if ($1202) {
            break;
           }
           $1203 = HEAP32[$193>>2]|0;
           $1204 = ($1203>>>0)<(29);
           if ($1204) {
            label = 423;
           }
          } else {
           label = 423;
          }
         } while(0);
         do {
          if ((label|0) == 423) {
           label = 0;
           $1205 = (($out$5$i$i$i) - ($left$0$i$i$i688))|0;
           $1206 = HEAP32[$196>>2]|0;
           $1207 = ($1206|0)==(0|0);
           if ($1207) {
            $1208 = HEAP32[$$pre906>>2]|0;
            $1209 = 1 << $1208;
            $1210 = (_zcalloc(0,$1209,1)|0);
            HEAP32[$196>>2] = $1210;
            $1211 = ($1210|0)==(0|0);
            if ($1211) {
             label = 434;
             break L116;
            }
            $$pre882 = HEAP32[$198>>2]|0;
            $1213 = $$pre882;$1220 = $1210;
           } else {
            $1213 = $1200;$1220 = $1206;
           }
           $1212 = ($1213|0)==(0);
           if ($1212) {
            $1214 = HEAP32[$$pre906>>2]|0;
            $1215 = 1 << $1214;
            HEAP32[$198>>2] = $1215;
            HEAP32[$200>>2] = 0;
            HEAP32[$199>>2] = 0;
            $1217 = $1215;
           } else {
            $1217 = $1213;
           }
           $1216 = ($1217>>>0)>($1205>>>0);
           if (!($1216)) {
            $1218 = (0 - ($1217))|0;
            $1219 = (($put$0$i$i$i) + ($1218)|0);
            _memcpy(($1220|0),($1219|0),($1217|0))|0;
            HEAP32[$200>>2] = 0;
            $1221 = HEAP32[$198>>2]|0;
            HEAP32[$199>>2] = $1221;
            break;
           }
           $1222 = HEAP32[$200>>2]|0;
           $1223 = (($1217) - ($1222))|0;
           $1224 = ($1223>>>0)>($1205>>>0);
           $$1622 = $1224 ? $1205 : $1223;
           $1225 = (($1220) + ($1222)|0);
           $1226 = (0 - ($1205))|0;
           $1227 = (($put$0$i$i$i) + ($1226)|0);
           _memcpy(($1225|0),($1227|0),($$1622|0))|0;
           $1228 = (($1205) - ($$1622))|0;
           $1229 = ($1205|0)==($$1622|0);
           if (!($1229)) {
            $1230 = HEAP32[$196>>2]|0;
            $1231 = (0 - ($1228))|0;
            $1232 = (($put$0$i$i$i) + ($1231)|0);
            _memcpy(($1230|0),($1232|0),($1228|0))|0;
            HEAP32[$200>>2] = $1228;
            $1233 = HEAP32[$198>>2]|0;
            HEAP32[$199>>2] = $1233;
            break;
           }
           $1234 = HEAP32[$200>>2]|0;
           $1235 = (($1234) + ($1205))|0;
           HEAP32[$200>>2] = $1235;
           $1236 = HEAP32[$198>>2]|0;
           $1237 = ($1235|0)==($1236|0);
           $$1623 = $1237 ? 0 : $1235;
           HEAP32[$200>>2] = $$1623;
           $1238 = HEAP32[$199>>2]|0;
           $1239 = ($1238>>>0)<($1236>>>0);
           if (!($1239)) {
            break;
           }
           $1240 = (($1238) + ($1205))|0;
           HEAP32[$199>>2] = $1240;
          }
         } while(0);
         $1241 = (($out$5$i$i$i) - ($left$0$i$i$i688))|0;
         $1242 = (($zs$i$i$sroa$47$4) + ($1241))|0;
         $1243 = HEAP32[$201>>2]|0;
         $1244 = (($1243) + ($1241))|0;
         HEAP32[$201>>2] = $1244;
         $1245 = HEAP32[$197>>2]|0;
         $1246 = ($1245|0)==(0);
         $1247 = ($out$5$i$i$i|0)==($left$0$i$i$i688|0);
         $or$cond1624 = $1246 | $1247;
         if (!($or$cond1624)) {
          $1248 = HEAP32[$214>>2]|0;
          $1249 = ($1248|0)==(0);
          $1250 = HEAP32[$215>>2]|0;
          $1251 = (0 - ($1241))|0;
          $1252 = (($put$0$i$i$i) + ($1251)|0);
          if ($1249) {
           $1254 = (_adler32($1250,$1252,$1241)|0);
           $1255 = $1254;
          } else {
           $1253 = (_crc32($1250,$1252,$1241)|0);
           $1255 = $1253;
          }
          HEAP32[$215>>2] = $1255;
         }
         $1256 = ($zs$i$i$sroa$11$0|0)==($have$65$i$i$i|0);
         if ($1256) {
          $1257 = ($out$5$i$i$i|0)==($left$0$i$i$i688|0);
          $1258 = ($ret$9$i$i$i|0)==(0);
          $or$cond1625 = $1257 & $1258;
          if ($or$cond1625) {
           $zs$i$i$sroa$47$5$ph = $1242;
           label = 442;
           break;
          } else {
           $$0$i2$i$i = $ret$9$i$i$i;$zs$i$i$sroa$0$2 = $next$65$i$i$i;$zs$i$i$sroa$11$2 = $zs$i$i$sroa$11$0;$zs$i$i$sroa$24$2 = $put$0$i$i$i;$zs$i$i$sroa$36$2 = $left$0$i$i$i688;$zs$i$i$sroa$47$5 = $1242;
          }
         } else {
          $$0$i2$i$i = $ret$9$i$i$i;$zs$i$i$sroa$0$2 = $next$65$i$i$i;$zs$i$i$sroa$11$2 = $have$65$i$i$i;$zs$i$i$sroa$24$2 = $put$0$i$i$i;$zs$i$i$sroa$36$2 = $left$0$i$i$i688;$zs$i$i$sroa$47$5 = $1242;
         }
         $1259 = ($$0$i2$i$i|0)==(0);
         if ($1259) {
          $zs$i$i$sroa$0$0 = $zs$i$i$sroa$0$2;$zs$i$i$sroa$11$0 = $zs$i$i$sroa$11$2;$zs$i$i$sroa$24$0 = $zs$i$i$sroa$24$2;$zs$i$i$sroa$36$0 = $zs$i$i$sroa$36$2;$zs$i$i$sroa$47$0 = $zs$i$i$sroa$47$5;
         } else {
          $zs$i$i$sroa$47$6 = $zs$i$i$sroa$47$5;
          break;
         }
        }
        if ((label|0) == 193) {
         HEAP32[$206>>2] = $hold$17$i$i$i;
         HEAP32[$207>>2] = $bits$17$i$i$i;
         $zs$i$i$sroa$47$5$ph = $zs$i$i$sroa$47$1;
         label = 442;
        }
        else if ((label|0) == 205) {
         // unreachable;
        }
        else if ((label|0) == 434) {
         HEAP32[$193>>2] = 30;
         $zs$i$i$sroa$47$5$ph = $zs$i$i$sroa$47$4;
         label = 442;
        }
        if ((label|0) == 442) {
         $zs$i$i$sroa$47$6 = $zs$i$i$sroa$47$5$ph;
        }
        $1260 = HEAP32[$196>>2]|0;
        $1261 = ($1260|0)==(0|0);
        if (!($1261)) {
         _zcfree(0,$1260);
        }
        _zcfree(0,$193);
        $$0$i$i82 = $zs$i$i$sroa$47$6;
       }
      }
      $len$0$i = $$0$i$i82;
     } else {
      label = 448;
     }
    } else {
     label = 448;
    }
    if ((label|0) == 448) {
     $1262 = ((($0)) + 52|0);
     HEAP32[$1262>>2] = 0;
     $1263 = (_hpeek($hfile,$s$i,21)|0);
     $len$0$i = $1263;
    }
    $1264 = ($len$0$i|0)<(0);
    if (!($1264)) {
     $1265 = ((($0)) + 56|0);
     HEAP16[$1265>>1] = -1;
     $1266 = ((($0)) + 60|0);
     HEAP32[$1266>>2] = 0;
     $1267 = ($len$0$i|0)>(5);
     do {
      if ($1267) {
       $$03$i93$i = 4;$l$04$i92$i = $s$i;$r$05$i91$i = 13749;
       while(1) {
        $1268 = HEAP8[$l$04$i92$i>>0]|0;
        $1269 = HEAP8[$r$05$i91$i>>0]|0;
        $1270 = ($1268<<24>>24)==($1269<<24>>24);
        if (!($1270)) {
         label = 453;
         break;
        }
        $1271 = (($$03$i93$i) + -1)|0;
        $1272 = ((($l$04$i92$i)) + 1|0);
        $1273 = ((($r$05$i91$i)) + 1|0);
        $1274 = ($1271|0)==(0);
        if ($1274) {
         break;
        } else {
         $$03$i93$i = $1271;$l$04$i92$i = $1272;$r$05$i91$i = $1273;
        }
       }
       if ((label|0) == 453) {
        $1275 = ($1268<<24>>24)==($1269<<24>>24);
        if (!($1275)) {
         label = 457;
         break;
        }
       }
       $1276 = ((($s$i)) + 4|0);
       $1277 = HEAP8[$1276>>0]|0;
       $$off1635 = (($1277) + -1)<<24>>24;
       $1278 = ($$off1635&255)<(3);
       if ($1278) {
        $1279 = ((($s$i)) + 5|0);
        $1280 = HEAP8[$1279>>0]|0;
        $1281 = ($1280&255)<(2);
        if ($1281) {
         HEAP32[$166>>2] = 1;
         $1282 = ((($0)) + 44|0);
         HEAP32[$1282>>2] = 6;
         $1283 = HEAP8[$1276>>0]|0;
         $1284 = $1283&255;
         $1285 = ((($0)) + 48|0);
         HEAP16[$1285>>1] = $1284;
         $1286 = HEAP8[$1279>>0]|0;
         $1287 = $1286&255;
         $1288 = ((($0)) + 50|0);
         HEAP16[$1288>>1] = $1287;
         $1289 = ((($0)) + 52|0);
         HEAP32[$1289>>2] = 3;
         $$pre$phi898Z2D = $1282;
        } else {
         label = 457;
        }
       } else {
        label = 457;
       }
      } else {
       label = 457;
      }
     } while(0);
     L635: do {
      if ((label|0) == 457) {
       $1290 = ($len$0$i|0)>(3);
       L637: do {
        if ($1290) {
         $1291 = ((($s$i)) + 3|0);
         $1292 = HEAP8[$1291>>0]|0;
         $1293 = ($1292&255)<(5);
         if ($1293) {
          $$03$i86$i = 4;$l$04$i85$i = $s$i;$r$05$i84$i = 13754;
          while(1) {
           $1294 = HEAP8[$l$04$i85$i>>0]|0;
           $1295 = HEAP8[$r$05$i84$i>>0]|0;
           $1296 = ($1294<<24>>24)==($1295<<24>>24);
           if (!($1296)) {
            label = 461;
            break;
           }
           $1297 = (($$03$i86$i) + -1)|0;
           $1298 = ((($l$04$i85$i)) + 1|0);
           $1299 = ((($r$05$i84$i)) + 1|0);
           $1300 = ($1297|0)==(0);
           if ($1300) {
            break;
           } else {
            $$03$i86$i = $1297;$l$04$i85$i = $1298;$r$05$i84$i = $1299;
           }
          }
          do {
           if ((label|0) == 461) {
            $1301 = ($1294<<24>>24)==($1295<<24>>24);
            if ($1301) {
             break;
            } else {
             $$03$i79$i = 4;$l$04$i78$i = $s$i;$r$05$i77$i = 13759;
            }
            while(1) {
             $1305 = HEAP8[$l$04$i78$i>>0]|0;
             $1306 = HEAP8[$r$05$i77$i>>0]|0;
             $1307 = ($1305<<24>>24)==($1306<<24>>24);
             if (!($1307)) {
              label = 465;
              break;
             }
             $1308 = (($$03$i79$i) + -1)|0;
             $1309 = ((($l$04$i78$i)) + 1|0);
             $1310 = ((($r$05$i77$i)) + 1|0);
             $1311 = ($1308|0)==(0);
             if ($1311) {
              break;
             } else {
              $$03$i79$i = $1308;$l$04$i78$i = $1309;$r$05$i77$i = $1310;
             }
            }
            do {
             if ((label|0) == 465) {
              $1312 = ($1305<<24>>24)==($1306<<24>>24);
              if ($1312) {
               break;
              } else {
               $$03$i72$i = 4;$l$04$i71$i = $s$i;$r$05$i70$i = 13764;
              }
              while(1) {
               $1316 = HEAP8[$l$04$i71$i>>0]|0;
               $1317 = HEAP8[$r$05$i70$i>>0]|0;
               $1318 = ($1316<<24>>24)==($1317<<24>>24);
               if (!($1318)) {
                label = 469;
                break;
               }
               $1319 = (($$03$i72$i) + -1)|0;
               $1320 = ((($l$04$i71$i)) + 1|0);
               $1321 = ((($r$05$i70$i)) + 1|0);
               $1322 = ($1319|0)==(0);
               if ($1322) {
                break;
               } else {
                $$03$i72$i = $1319;$l$04$i71$i = $1320;$r$05$i70$i = $1321;
               }
              }
              do {
               if ((label|0) == 469) {
                $1323 = ($1316<<24>>24)==($1317<<24>>24);
                if ($1323) {
                 break;
                } else {
                 $$03$i65$i = 4;$l$04$i64$i = $s$i;$r$05$i63$i = 13769;
                }
                while(1) {
                 $1327 = HEAP8[$l$04$i64$i>>0]|0;
                 $1328 = HEAP8[$r$05$i63$i>>0]|0;
                 $1329 = ($1327<<24>>24)==($1328<<24>>24);
                 if (!($1329)) {
                  label = 473;
                  break;
                 }
                 $1330 = (($$03$i65$i) + -1)|0;
                 $1331 = ((($l$04$i64$i)) + 1|0);
                 $1332 = ((($r$05$i63$i)) + 1|0);
                 $1333 = ($1330|0)==(0);
                 if ($1333) {
                  break;
                 } else {
                  $$03$i65$i = $1330;$l$04$i64$i = $1331;$r$05$i63$i = $1332;
                 }
                }
                do {
                 if ((label|0) == 473) {
                  $1334 = ($1327<<24>>24)==($1328<<24>>24);
                  if ($1334) {
                   break;
                  } else {
                   $$03$i58$i = 4;$l$04$i57$i = $s$i;$r$05$i56$i = 13774;
                  }
                  while(1) {
                   $1345 = HEAP8[$l$04$i57$i>>0]|0;
                   $1346 = HEAP8[$r$05$i56$i>>0]|0;
                   $1347 = ($1345<<24>>24)==($1346<<24>>24);
                   if (!($1347)) {
                    label = 479;
                    break;
                   }
                   $1348 = (($$03$i58$i) + -1)|0;
                   $1349 = ((($l$04$i57$i)) + 1|0);
                   $1350 = ((($r$05$i56$i)) + 1|0);
                   $1351 = ($1348|0)==(0);
                   if ($1351) {
                    break;
                   } else {
                    $$03$i58$i = $1348;$l$04$i57$i = $1349;$r$05$i56$i = $1350;
                   }
                  }
                  do {
                   if ((label|0) == 479) {
                    $1352 = ($1345<<24>>24)==($1346<<24>>24);
                    if ($1352) {
                     break;
                    } else {
                     $$03$i51$i = 4;$l$04$i50$i = $s$i;$r$05$i49$i = 13779;
                    }
                    while(1) {
                     $1356 = HEAP8[$l$04$i50$i>>0]|0;
                     $1357 = HEAP8[$r$05$i49$i>>0]|0;
                     $1358 = ($1356<<24>>24)==($1357<<24>>24);
                     if (!($1358)) {
                      label = 483;
                      break;
                     }
                     $1359 = (($$03$i51$i) + -1)|0;
                     $1360 = ((($l$04$i50$i)) + 1|0);
                     $1361 = ((($r$05$i49$i)) + 1|0);
                     $1362 = ($1359|0)==(0);
                     if ($1362) {
                      break;
                     } else {
                      $$03$i51$i = $1359;$l$04$i50$i = $1360;$r$05$i49$i = $1361;
                     }
                    }
                    do {
                     if ((label|0) == 483) {
                      $1363 = ($1356<<24>>24)==($1357<<24>>24);
                      if ($1363) {
                       break;
                      }
                      HEAP32[$166>>2] = 0;
                      $1367 = ((($0)) + 44|0);
                      HEAP32[$1367>>2] = 0;
                      $1368 = ((($0)) + 50|0);
                      HEAP16[$1368>>1] = -1;
                      $1369 = ((($0)) + 48|0);
                      HEAP16[$1369>>1] = -1;
                      $1370 = ((($0)) + 52|0);
                      HEAP32[$1370>>2] = 0;
                      $$pre$phi898Z2D = $1367;
                      break L635;
                     }
                    } while(0);
                    HEAP32[$166>>2] = 3;
                    $1364 = ((($0)) + 44|0);
                    HEAP32[$1364>>2] = 12;
                    $1365 = ((($0)) + 48|0);
                    HEAP16[$1365>>1] = -1;
                    $1366 = ((($0)) + 50|0);
                    HEAP16[$1366>>1] = -1;
                    $$pre$phi898Z2D = $1364;
                    break L635;
                   }
                  } while(0);
                  HEAP32[$166>>2] = 3;
                  $1353 = ((($0)) + 44|0);
                  HEAP32[$1353>>2] = 10;
                  $1354 = ((($0)) + 48|0);
                  HEAP16[$1354>>1] = 1;
                  $1355 = ((($0)) + 50|0);
                  HEAP16[$1355>>1] = -1;
                  $$pre$phi898Z2D = $1353;
                  break L635;
                 }
                } while(0);
                HEAP32[$166>>2] = 2;
                $1335 = ((($0)) + 44|0);
                HEAP32[$1335>>2] = 9;
                $1336 = HEAP8[$1291>>0]|0;
                $1337 = $1336&255;
                $1338 = ((($0)) + 48|0);
                HEAP16[$1338>>1] = $1337;
                $1339 = ($len$0$i|0)>(4);
                if ($1339) {
                 $1340 = ((($s$i)) + 4|0);
                 $1341 = HEAP8[$1340>>0]|0;
                 $1342 = ($1341&255)<(3);
                 $phitmp$i = $1341&255;
                 $phitmp$i$ = $1342 ? $phitmp$i : 0;
                 $1344 = $phitmp$i$;
                } else {
                 $1344 = 0;
                }
                $1343 = ((($0)) + 50|0);
                HEAP16[$1343>>1] = $1344;
                $$pre$phi898Z2D = $1335;
                break L635;
               }
              } while(0);
              HEAP32[$166>>2] = 2;
              $1324 = ((($0)) + 44|0);
              HEAP32[$1324>>2] = 9;
              $1325 = ((($0)) + 48|0);
              HEAP16[$1325>>1] = 1;
              $1326 = ((($0)) + 50|0);
              HEAP16[$1326>>1] = -1;
              $$pre$phi898Z2D = $1324;
              break L635;
             }
            } while(0);
            HEAP32[$166>>2] = 3;
            $1313 = ((($0)) + 44|0);
            HEAP32[$1313>>2] = 5;
            $1314 = ((($0)) + 48|0);
            HEAP16[$1314>>1] = -1;
            $1315 = ((($0)) + 50|0);
            HEAP16[$1315>>1] = -1;
            $$pre$phi898Z2D = $1313;
            break L635;
           }
          } while(0);
          HEAP32[$166>>2] = 1;
          $1302 = ((($0)) + 44|0);
          HEAP32[$1302>>2] = 4;
          $1303 = ((($0)) + 48|0);
          HEAP16[$1303>>1] = 1;
          $1304 = ((($0)) + 50|0);
          HEAP16[$1304>>1] = -1;
          $$pre$phi898Z2D = $1302;
          break L635;
         }
         $1371 = ($len$0$i|0)>(15);
         do {
          if ($1371) {
           $$03$i44$i = 16;$l$04$i43$i = $s$i;$r$05$i42$i = 13784;
           while(1) {
            $1372 = HEAP8[$l$04$i43$i>>0]|0;
            $1373 = HEAP8[$r$05$i42$i>>0]|0;
            $1374 = ($1372<<24>>24)==($1373<<24>>24);
            if (!($1374)) {
             label = 489;
             break;
            }
            $1375 = (($$03$i44$i) + -1)|0;
            $1376 = ((($l$04$i43$i)) + 1|0);
            $1377 = ((($r$05$i42$i)) + 1|0);
            $1378 = ($1375|0)==(0);
            if ($1378) {
             break;
            } else {
             $$03$i44$i = $1375;$l$04$i43$i = $1376;$r$05$i42$i = $1377;
            }
           }
           if ((label|0) == 489) {
            $1379 = ($1372<<24>>24)==($1373<<24>>24);
            if (!($1379)) {
             break;
            }
           }
           HEAP32[$166>>2] = 2;
           $1380 = ((($0)) + 44|0);
           HEAP32[$1380>>2] = 8;
           $1381 = ($len$0$i|0)>(20);
           do {
            if ($1381) {
             $1382 = ((($s$i)) + 16|0);
             $1383 = HEAP8[$1382>>0]|0;
             $1384 = ($1383<<24>>24)==(118);
             if (!($1384)) {
              break;
             }
             $1385 = ((($s$i)) + 17|0);
             $1386 = (($s$i) + ($len$0$i)|0);
             $1387 = ((($0)) + 50|0);
             HEAP16[$1387>>1] = -1;
             $1388 = ((($0)) + 48|0);
             HEAP16[$1388>>1] = -1;
             $s$0$i36$i = $1385;$v$0$i37$i = 0;
             while(1) {
              $1389 = ($s$0$i36$i>>>0)<($1386>>>0);
              if (!($1389)) {
               $$pre$phi898Z2D = $1380;
               break L635;
              }
              $1390 = HEAP8[$s$0$i36$i>>0]|0;
              $1391 = $1390&255;
              $1392 = (($1391) + -48)|0;
              $1393 = ($1392>>>0)<(10);
              if (!($1393)) {
               break;
              }
              $1394 = $v$0$i37$i << 16 >> 16;
              $1395 = ($1394*10)|0;
              $1396 = $1390 << 24 >> 24;
              $1397 = (($1395) + ($1396))|0;
              $1398 = (($1397) + 65488)|0;
              $1399 = $1398&65535;
              $1400 = ((($s$0$i36$i)) + 1|0);
              $s$0$i36$i = $1400;$v$0$i37$i = $1399;
             }
             HEAP16[$1388>>1] = $v$0$i37$i;
             $1401 = HEAP8[$s$0$i36$i>>0]|0;
             $1402 = ($1401<<24>>24)==(46);
             if ($1402) {
              $s$0$pn$i38$i = $s$0$i36$i;$v$1$i39$i = 0;
             } else {
              HEAP16[$1387>>1] = 0;
              $$pre$phi898Z2D = $1380;
              break L635;
             }
             while(1) {
              $s$1$i40$i = ((($s$0$pn$i38$i)) + 1|0);
              $1403 = ($s$1$i40$i>>>0)<($1386>>>0);
              if (!($1403)) {
               $$pre$phi898Z2D = $1380;
               break L635;
              }
              $1404 = HEAP8[$s$1$i40$i>>0]|0;
              $1405 = $1404&255;
              $1406 = (($1405) + -48)|0;
              $1407 = ($1406>>>0)<(10);
              if (!($1407)) {
               break;
              }
              $1408 = $v$1$i39$i << 16 >> 16;
              $1409 = ($1408*10)|0;
              $1410 = $1404 << 24 >> 24;
              $1411 = (($1409) + ($1410))|0;
              $1412 = (($1411) + 65488)|0;
              $1413 = $1412&65535;
              $s$0$pn$i38$i = $s$1$i40$i;$v$1$i39$i = $1413;
             }
             HEAP16[$1387>>1] = $v$1$i39$i;
             $$pre$phi898Z2D = $1380;
             break L635;
            }
           } while(0);
           $1414 = ((($0)) + 50|0);
           HEAP16[$1414>>1] = -1;
           $1415 = ((($0)) + 48|0);
           HEAP16[$1415>>1] = -1;
           $$pre$phi898Z2D = $1380;
           break L635;
          }
         } while(0);
         $1416 = HEAP8[$s$i>>0]|0;
         $1417 = ($1416<<24>>24)==(64);
         if ($1417) {
          $$03$i31$i = 4;$1420 = 64;$l$04$i30$i = $s$i;$r$05$i29$i = 13801;
          while(1) {
           $1418 = HEAP8[$r$05$i29$i>>0]|0;
           $1419 = ($1420<<24>>24)==($1418<<24>>24);
           if (!($1419)) {
            label = 507;
            break;
           }
           $1421 = (($$03$i31$i) + -1)|0;
           $1422 = ((($l$04$i30$i)) + 1|0);
           $1423 = ($1421|0)==(0);
           if ($1423) {
            break;
           }
           $1424 = ((($r$05$i29$i)) + 1|0);
           $$pre884 = HEAP8[$1422>>0]|0;
           $$03$i31$i = $1421;$1420 = $$pre884;$l$04$i30$i = $1422;$r$05$i29$i = $1424;
          }
          L709: do {
           if ((label|0) == 507) {
            $1425 = ($1420<<24>>24)==($1418<<24>>24);
            if ($1425) {
             break;
            } else {
             $$03$i24$i = 4;$1428 = 64;$l$04$i23$i = $s$i;$r$05$i22$i = 13806;
            }
            while(1) {
             $1426 = HEAP8[$r$05$i22$i>>0]|0;
             $1427 = ($1428<<24>>24)==($1426<<24>>24);
             if (!($1427)) {
              break;
             }
             $1429 = (($$03$i24$i) + -1)|0;
             $1430 = ((($l$04$i23$i)) + 1|0);
             $1431 = ($1429|0)==(0);
             if ($1431) {
              break L709;
             }
             $1432 = ((($r$05$i22$i)) + 1|0);
             $$pre885 = HEAP8[$1430>>0]|0;
             $$03$i24$i = $1429;$1428 = $$pre885;$l$04$i23$i = $1430;$r$05$i22$i = $1432;
            }
            $1433 = ($1428<<24>>24)==($1426<<24>>24);
            if ($1433) {
             break;
            } else {
             $$03$i17$i = 4;$1436 = 64;$l$04$i16$i = $s$i;$r$05$i15$i = 13811;
            }
            while(1) {
             $1434 = HEAP8[$r$05$i15$i>>0]|0;
             $1435 = ($1436<<24>>24)==($1434<<24>>24);
             if (!($1435)) {
              break;
             }
             $1437 = (($$03$i17$i) + -1)|0;
             $1438 = ((($l$04$i16$i)) + 1|0);
             $1439 = ($1437|0)==(0);
             if ($1439) {
              break L709;
             }
             $1440 = ((($r$05$i15$i)) + 1|0);
             $$pre886 = HEAP8[$1438>>0]|0;
             $$03$i17$i = $1437;$1436 = $$pre886;$l$04$i16$i = $1438;$r$05$i15$i = $1440;
            }
            $1441 = ($1436<<24>>24)==($1434<<24>>24);
            if ($1441) {
             break;
            } else {
             $$03$i10$i = 4;$1444 = 64;$l$04$i9$i = $s$i;$r$05$i8$i = 13816;
            }
            while(1) {
             $1442 = HEAP8[$r$05$i8$i>>0]|0;
             $1443 = ($1444<<24>>24)==($1442<<24>>24);
             if (!($1443)) {
              break;
             }
             $1445 = (($$03$i10$i) + -1)|0;
             $1446 = ((($l$04$i9$i)) + 1|0);
             $1447 = ($1445|0)==(0);
             if ($1447) {
              break L709;
             }
             $1448 = ((($r$05$i8$i)) + 1|0);
             $$pre887 = HEAP8[$1446>>0]|0;
             $$03$i10$i = $1445;$1444 = $$pre887;$l$04$i9$i = $1446;$r$05$i8$i = $1448;
            }
            $1449 = ($1444<<24>>24)==($1442<<24>>24);
            if (!($1449)) {
             break L637;
            }
           }
          } while(0);
          HEAP32[$166>>2] = 1;
          $1450 = ((($0)) + 44|0);
          HEAP32[$1450>>2] = 3;
          $1451 = ($len$0$i|0)>(8);
          do {
           if ($1451) {
            $$03$i3$i = 7;$l$04$i2$i = $s$i;$r$05$i1$i = 13821;
            while(1) {
             $1452 = HEAP8[$l$04$i2$i>>0]|0;
             $1453 = HEAP8[$r$05$i1$i>>0]|0;
             $1454 = ($1452<<24>>24)==($1453<<24>>24);
             if (!($1454)) {
              label = 523;
              break;
             }
             $1455 = (($$03$i3$i) + -1)|0;
             $1456 = ((($l$04$i2$i)) + 1|0);
             $1457 = ((($r$05$i1$i)) + 1|0);
             $1458 = ($1455|0)==(0);
             if ($1458) {
              break;
             } else {
              $$03$i3$i = $1455;$l$04$i2$i = $1456;$r$05$i1$i = $1457;
             }
            }
            if ((label|0) == 523) {
             $1459 = ($1452<<24>>24)==($1453<<24>>24);
             if (!($1459)) {
              break;
             }
            }
            $1460 = ((($s$i)) + 7|0);
            $1461 = (($s$i) + ($len$0$i)|0);
            $1462 = ((($0)) + 50|0);
            HEAP16[$1462>>1] = -1;
            $1463 = ((($0)) + 48|0);
            HEAP16[$1463>>1] = -1;
            $s$0$i$i = $1460;$v$0$i$i = 0;
            while(1) {
             $1464 = ($s$0$i$i>>>0)<($1461>>>0);
             if (!($1464)) {
              $$pre$phi898Z2D = $1450;
              break L635;
             }
             $1465 = HEAP8[$s$0$i$i>>0]|0;
             $1466 = $1465&255;
             $1467 = (($1466) + -48)|0;
             $1468 = ($1467>>>0)<(10);
             if (!($1468)) {
              break;
             }
             $1469 = $v$0$i$i << 16 >> 16;
             $1470 = ($1469*10)|0;
             $1471 = $1465 << 24 >> 24;
             $1472 = (($1470) + ($1471))|0;
             $1473 = (($1472) + 65488)|0;
             $1474 = $1473&65535;
             $1475 = ((($s$0$i$i)) + 1|0);
             $s$0$i$i = $1475;$v$0$i$i = $1474;
            }
            HEAP16[$1463>>1] = $v$0$i$i;
            $1476 = HEAP8[$s$0$i$i>>0]|0;
            $1477 = ($1476<<24>>24)==(46);
            if ($1477) {
             $s$0$pn$i$i = $s$0$i$i;$v$1$i$i = 0;
            } else {
             HEAP16[$1462>>1] = 0;
             $$pre$phi898Z2D = $1450;
             break L635;
            }
            while(1) {
             $s$1$i$i = ((($s$0$pn$i$i)) + 1|0);
             $1478 = ($s$1$i$i>>>0)<($1461>>>0);
             if (!($1478)) {
              $$pre$phi898Z2D = $1450;
              break L635;
             }
             $1479 = HEAP8[$s$1$i$i>>0]|0;
             $1480 = $1479&255;
             $1481 = (($1480) + -48)|0;
             $1482 = ($1481>>>0)<(10);
             if (!($1482)) {
              break;
             }
             $1483 = $v$1$i$i << 16 >> 16;
             $1484 = ($1483*10)|0;
             $1485 = $1479 << 24 >> 24;
             $1486 = (($1484) + ($1485))|0;
             $1487 = (($1486) + 65488)|0;
             $1488 = $1487&65535;
             $s$0$pn$i$i = $s$1$i$i;$v$1$i$i = $1488;
            }
            HEAP16[$1462>>1] = $v$1$i$i;
            $$pre$phi898Z2D = $1450;
            break L635;
           }
          } while(0);
          $1489 = ((($0)) + 48|0);
          HEAP16[$1489>>1] = 1;
          $1490 = ((($0)) + 50|0);
          HEAP16[$1490>>1] = -1;
          $$pre$phi898Z2D = $1450;
          break L635;
         }
        }
       } while(0);
       HEAP32[$166>>2] = 1;
       $1491 = ((($0)) + 44|0);
       HEAP32[$1491>>2] = 3;
       $1492 = ((($0)) + 48|0);
       HEAP16[$1492>>1] = 1;
       $1493 = ((($0)) + 50|0);
       HEAP16[$1493>>1] = -1;
       $$pre$phi898Z2D = $1491;
      }
     } while(0);
     $1494 = HEAP32[$$pre$phi898Z2D>>2]|0;
     HEAP32[$vararg_buffer2>>2] = $1494;
     $vararg_ptr5 = ((($vararg_buffer2)) + 4|0);
     HEAP32[$vararg_ptr5>>2] = 1;
     _printf(13407,$vararg_buffer2);
     $1495 = HEAP32[$$pre$phi898Z2D>>2]|0;
     switch ($1495|0) {
     case 9: case 4: case 1:  {
      (_puts((17290|0))|0);
      L751: do {
       if ($135) {
        $$02$lcssa$i$i$i = $simple_mode;
        label = 541;
       } else {
        $$0211$i$i$i = $simple_mode;
        while(1) {
         $1496 = HEAP8[$$0211$i$i$i>>0]|0;
         switch ($1496<<24>>24) {
         case 0: case 114:  {
          $$0$i$i$i = $$0211$i$i$i;$1524 = $1496;
          break L751;
          break;
         }
         default: {
         }
         }
         $1497 = ((($$0211$i$i$i)) + 1|0);
         $1498 = $1497;
         $1499 = $1498 & 3;
         $1500 = ($1499|0)==(0);
         if ($1500) {
          $$02$lcssa$i$i$i = $1497;
          label = 541;
          break L751;
         } else {
          $$0211$i$i$i = $1497;
         }
        }
       }
      } while(0);
      L755: do {
       if ((label|0) == 541) {
        $1501 = HEAP32[$$02$lcssa$i$i$i>>2]|0;
        $1502 = (($1501) + -16843009)|0;
        $1503 = $1501 & -2139062144;
        $1504 = $1503 ^ -2139062144;
        $1505 = $1504 & $1502;
        $1506 = ($1505|0)==(0);
        L757: do {
         if ($1506) {
          $1508 = $1501;$w$08$i$i$i = $$02$lcssa$i$i$i;
          while(1) {
           $1507 = $1508 ^ 1920103026;
           $1509 = (($1507) + -16843009)|0;
           $1510 = $1508 & -2139062144;
           $1511 = $1510 ^ -2139062144;
           $1512 = $1511 & $1509;
           $1513 = ($1512|0)==(0);
           if (!($1513)) {
            $w$0$lcssa$i$i$i = $w$08$i$i$i;
            break L757;
           }
           $1514 = ((($w$08$i$i$i)) + 4|0);
           $1515 = HEAP32[$1514>>2]|0;
           $1516 = (($1515) + -16843009)|0;
           $1517 = $1515 & -2139062144;
           $1518 = $1517 ^ -2139062144;
           $1519 = $1518 & $1516;
           $1520 = ($1519|0)==(0);
           if ($1520) {
            $1508 = $1515;$w$08$i$i$i = $1514;
           } else {
            $w$0$lcssa$i$i$i = $1514;
            break;
           }
          }
         } else {
          $w$0$lcssa$i$i$i = $$02$lcssa$i$i$i;
         }
        } while(0);
        $$1$i$i$i = $w$0$lcssa$i$i$i;
        while(1) {
         $1521 = HEAP8[$$1$i$i$i>>0]|0;
         $1522 = ((($$1$i$i$i)) + 1|0);
         switch ($1521<<24>>24) {
         case 0: case 114:  {
          $$0$i$i$i = $$1$i$i$i;$1524 = $1521;
          break L755;
          break;
         }
         default: {
          $$1$i$i$i = $1522;
         }
         }
        }
       }
      } while(0);
      $1523 = ($$0$i$i$i|0)==(0|0);
      $not$85 = ($1524<<24>>24)!=(114);
      $1525 = $1523 | $not$85;
      L765: do {
       if ($1525) {
        L767: do {
         if ($135) {
          $$02$lcssa$i$i14$i = $simple_mode;
          label = 569;
         } else {
          $$0211$i$i11$i = $simple_mode;
          while(1) {
           $1577 = HEAP8[$$0211$i$i11$i>>0]|0;
           switch ($1577<<24>>24) {
           case 0: case 119:  {
            $$0$i$i27$i = $$0211$i$i11$i;$1605 = $1577;
            break L767;
            break;
           }
           default: {
           }
           }
           $1578 = ((($$0211$i$i11$i)) + 1|0);
           $1579 = $1578;
           $1580 = $1579 & 3;
           $1581 = ($1580|0)==(0);
           if ($1581) {
            $$02$lcssa$i$i14$i = $1578;
            label = 569;
            break L767;
           } else {
            $$0211$i$i11$i = $1578;
           }
          }
         }
        } while(0);
        L771: do {
         if ((label|0) == 569) {
          $1582 = HEAP32[$$02$lcssa$i$i14$i>>2]|0;
          $1583 = (($1582) + -16843009)|0;
          $1584 = $1582 & -2139062144;
          $1585 = $1584 ^ -2139062144;
          $1586 = $1585 & $1583;
          $1587 = ($1586|0)==(0);
          L773: do {
           if ($1587) {
            $1589 = $1582;$w$08$i$i17$i = $$02$lcssa$i$i14$i;
            while(1) {
             $1588 = $1589 ^ 2004318071;
             $1590 = (($1588) + -16843009)|0;
             $1591 = $1589 & -2139062144;
             $1592 = $1591 ^ -2139062144;
             $1593 = $1592 & $1590;
             $1594 = ($1593|0)==(0);
             if (!($1594)) {
              $w$0$lcssa$i$i21$i = $w$08$i$i17$i;
              break L773;
             }
             $1595 = ((($w$08$i$i17$i)) + 4|0);
             $1596 = HEAP32[$1595>>2]|0;
             $1597 = (($1596) + -16843009)|0;
             $1598 = $1596 & -2139062144;
             $1599 = $1598 ^ -2139062144;
             $1600 = $1599 & $1597;
             $1601 = ($1600|0)==(0);
             if ($1601) {
              $1589 = $1596;$w$08$i$i17$i = $1595;
             } else {
              $w$0$lcssa$i$i21$i = $1595;
              break;
             }
            }
           } else {
            $w$0$lcssa$i$i21$i = $$02$lcssa$i$i14$i;
           }
          } while(0);
          $$1$i$i23$i = $w$0$lcssa$i$i21$i;
          while(1) {
           $1602 = HEAP8[$$1$i$i23$i>>0]|0;
           $1603 = ((($$1$i$i23$i)) + 1|0);
           switch ($1602<<24>>24) {
           case 0: case 119:  {
            $$0$i$i27$i = $$1$i$i23$i;$1605 = $1602;
            break L771;
            break;
           }
           default: {
            $$1$i$i23$i = $1603;
           }
           }
          }
         }
        } while(0);
        $1604 = ($$0$i$i27$i|0)==(0|0);
        $not$86 = ($1605<<24>>24)!=(119);
        $1606 = $1604 | $not$86;
        do {
         if ($1606) {
          L783: do {
           if ($135) {
            $$02$lcssa$i$i34$i = $simple_mode;
            label = 578;
           } else {
            $$0211$i$i31$i = $simple_mode;
            while(1) {
             $1607 = HEAP8[$$0211$i$i31$i>>0]|0;
             switch ($1607<<24>>24) {
             case 0: case 97:  {
              $$0$i$i47$i = $$0211$i$i31$i;$1635 = $1607;
              break L783;
              break;
             }
             default: {
             }
             }
             $1608 = ((($$0211$i$i31$i)) + 1|0);
             $1609 = $1608;
             $1610 = $1609 & 3;
             $1611 = ($1610|0)==(0);
             if ($1611) {
              $$02$lcssa$i$i34$i = $1608;
              label = 578;
              break L783;
             } else {
              $$0211$i$i31$i = $1608;
             }
            }
           }
          } while(0);
          L787: do {
           if ((label|0) == 578) {
            $1612 = HEAP32[$$02$lcssa$i$i34$i>>2]|0;
            $1613 = (($1612) + -16843009)|0;
            $1614 = $1612 & -2139062144;
            $1615 = $1614 ^ -2139062144;
            $1616 = $1615 & $1613;
            $1617 = ($1616|0)==(0);
            L789: do {
             if ($1617) {
              $1619 = $1612;$w$08$i$i37$i = $$02$lcssa$i$i34$i;
              while(1) {
               $1618 = $1619 ^ 1633771873;
               $1620 = (($1618) + -16843009)|0;
               $1621 = $1619 & -2139062144;
               $1622 = $1621 ^ -2139062144;
               $1623 = $1622 & $1620;
               $1624 = ($1623|0)==(0);
               if (!($1624)) {
                $w$0$lcssa$i$i41$i = $w$08$i$i37$i;
                break L789;
               }
               $1625 = ((($w$08$i$i37$i)) + 4|0);
               $1626 = HEAP32[$1625>>2]|0;
               $1627 = (($1626) + -16843009)|0;
               $1628 = $1626 & -2139062144;
               $1629 = $1628 ^ -2139062144;
               $1630 = $1629 & $1627;
               $1631 = ($1630|0)==(0);
               if ($1631) {
                $1619 = $1626;$w$08$i$i37$i = $1625;
               } else {
                $w$0$lcssa$i$i41$i = $1625;
                break;
               }
              }
             } else {
              $w$0$lcssa$i$i41$i = $$02$lcssa$i$i34$i;
             }
            } while(0);
            $$1$i$i43$i = $w$0$lcssa$i$i41$i;
            while(1) {
             $1632 = HEAP8[$$1$i$i43$i>>0]|0;
             $1633 = ((($$1$i$i43$i)) + 1|0);
             switch ($1632<<24>>24) {
             case 0: case 97:  {
              $$0$i$i47$i = $$1$i$i43$i;$1635 = $1632;
              break L787;
              break;
             }
             default: {
              $$1$i$i43$i = $1633;
             }
             }
            }
           }
          } while(0);
          $1634 = ($$0$i$i47$i|0)==(0|0);
          $not$89 = ($1635<<24>>24)!=(97);
          $1636 = $1634 | $not$89;
          if (!($1636)) {
           break;
          }
          $1793 = HEAP32[4331]|0;
          $1794 = ($1793|0)==(0|0);
          if ($1794) {
           $$0$i$i74 = 17368;
          } else {
           $1795 = (_pthread_self()|0);
           $1796 = ((($1795)) + 64|0);
           $1797 = HEAP32[$1796>>2]|0;
           $$0$i$i74 = $1797;
          }
          HEAP32[$$0$i$i74>>2] = 22;
          $$0$i75 = 0;
          break L765;
         }
        } while(0);
        $1637 = (_malloc(72)|0);
        $1638 = ($1637|0)==(0|0);
        do {
         if ($1638) {
          label = 634;
         } else {
          $1639 = ((($1637)) + -4|0);
          $1640 = HEAP32[$1639>>2]|0;
          $1641 = $1640 & 3;
          $1642 = ($1641|0)==(0);
          if ($1642) {
           $$pre892 = HEAP32[$1637>>2]|0;
           $$pre$phi900Z2D = $1637;$1644 = $$pre892;
          } else {
           dest=$1637; stop=dest+72|0; do { HEAP8[dest>>0]=0|0; dest=dest+1|0; } while ((dest|0) < (stop|0));
           $$pre$phi900Z2D = $1637;$1644 = 0;
          }
          $1643 = $1644 & -196609;
          $1645 = $1643 | 65536;
          HEAP32[$$pre$phi900Z2D>>2] = $1645;
          $i$0$i$i$i = 0;
          while(1) {
           $1646 = (($simple_mode) + ($i$0$i$i$i)|0);
           $1647 = HEAP8[$1646>>0]|0;
           $1648 = ($1647<<24>>24)==(0);
           $$off = (($1647) + -48)<<24>>24;
           $1649 = ($$off&255)<(10);
           $or$cond1633 = $1648 | $1649;
           if ($or$cond1633) {
            break;
           }
           $1650 = (($i$0$i$i$i) + 1)|0;
           $i$0$i$i$i = $1650;
          }
          $1651 = $1647 << 24 >> 24;
          $1652 = (($1651) + -48)|0;
          $compress_level$0$i$i$i = $1648 ? -1 : $1652;
          L812: do {
           if ($135) {
            $$02$lcssa$i$i$i$i$i = $simple_mode;
            label = 594;
           } else {
            $$0211$i$i$i$i$i = $simple_mode;
            while(1) {
             $1653 = HEAP8[$$0211$i$i$i$i$i>>0]|0;
             switch ($1653<<24>>24) {
             case 0: case 117:  {
              $$0$i$i$i$i$i = $$0211$i$i$i$i$i;$1680 = $1653;
              break L812;
              break;
             }
             default: {
             }
             }
             $1654 = ((($$0211$i$i$i$i$i)) + 1|0);
             $1655 = $1654;
             $1656 = $1655 & 3;
             $1657 = ($1656|0)==(0);
             if ($1657) {
              $$02$lcssa$i$i$i$i$i = $1654;
              label = 594;
              break L812;
             } else {
              $$0211$i$i$i$i$i = $1654;
             }
            }
           }
          } while(0);
          L816: do {
           if ((label|0) == 594) {
            $1658 = HEAP32[$$02$lcssa$i$i$i$i$i>>2]|0;
            $1659 = (($1658) + -16843009)|0;
            $1660 = $1658 & -2139062144;
            $1661 = $1660 ^ -2139062144;
            $1662 = $1661 & $1659;
            $1663 = ($1662|0)==(0);
            L818: do {
             if ($1663) {
              $1665 = $1658;$w$08$i$i$i$i$i = $$02$lcssa$i$i$i$i$i;
              while(1) {
               $1664 = $1665 ^ 1970632053;
               $1666 = (($1664) + -16843009)|0;
               $1667 = $1665 & -2139062144;
               $1668 = $1667 ^ -2139062144;
               $1669 = $1668 & $1666;
               $1670 = ($1669|0)==(0);
               if (!($1670)) {
                $w$0$lcssa$i$i$i$i$i = $w$08$i$i$i$i$i;
                break L818;
               }
               $1671 = ((($w$08$i$i$i$i$i)) + 4|0);
               $1672 = HEAP32[$1671>>2]|0;
               $1673 = (($1672) + -16843009)|0;
               $1674 = $1672 & -2139062144;
               $1675 = $1674 ^ -2139062144;
               $1676 = $1675 & $1673;
               $1677 = ($1676|0)==(0);
               if ($1677) {
                $1665 = $1672;$w$08$i$i$i$i$i = $1671;
               } else {
                $w$0$lcssa$i$i$i$i$i = $1671;
                break;
               }
              }
             } else {
              $w$0$lcssa$i$i$i$i$i = $$02$lcssa$i$i$i$i$i;
             }
            } while(0);
            $$1$i$i$i$i$i = $w$0$lcssa$i$i$i$i$i;
            while(1) {
             $1678 = HEAP8[$$1$i$i$i$i$i>>0]|0;
             $1679 = ((($$1$i$i$i$i$i)) + 1|0);
             switch ($1678<<24>>24) {
             case 0: case 117:  {
              $$0$i$i$i$i$i = $$1$i$i$i$i$i;$1680 = $1678;
              break L816;
              break;
             }
             default: {
              $$1$i$i$i$i$i = $1679;
             }
             }
            }
           }
          } while(0);
          $notlhs = ($$0$i$i$i$i$i|0)!=(0|0);
          $notrhs = ($1680<<24>>24)==(117);
          $$not = $notrhs & $notlhs;
          $1681 = ($compress_level$0$i$i$i|0)==(-2);
          $or$cond1634 = $$not | $1681;
          $1682 = $1645 & -1610743809;
          if ($or$cond1634) {
           HEAP32[$$pre$phi900Z2D>>2] = $1682;
           $fp$0$i = $1637;
           label = 650;
           break L765;
          }
          $1683 = $1682 | 536870912;
          HEAP32[$$pre$phi900Z2D>>2] = $1683;
          $1684 = (_malloc(131072)|0);
          $1685 = ((($1637)) + 40|0);
          HEAP32[$1685>>2] = $1684;
          $1686 = ($1684|0)==(0|0);
          if ($1686) {
           label = 634;
           break;
          }
          $1687 = ((($1684)) + 65536|0);
          $1688 = ((($1637)) + 44|0);
          HEAP32[$1688>>2] = $1687;
          $1689 = ($compress_level$0$i$i$i|0)<(0);
          $phitmp$i$i = $compress_level$0$i$i$i & 511;
          $$phitmp$i$i = $1689 ? 511 : $phitmp$i$i;
          $1690 = HEAP32[$$pre$phi900Z2D>>2]|0;
          $1691 = $$phitmp$i$i << 20;
          $1692 = $1690 & -535822337;
          $1693 = $1692 | $1691;
          $1694 = $$phitmp$i$i << 23;
          $1695 = ($1694|0)>(75497472);
          $1696 = $1690 | 535822336;
          $storemerge = $1695 ? $1696 : $1693;
          HEAP32[$$pre$phi900Z2D>>2] = $storemerge;
          L830: do {
           if ($135) {
            $$02$lcssa$i$i$i$i = $simple_mode;
            label = 605;
           } else {
            $$0211$i$i$i$i = $simple_mode;
            while(1) {
             $1697 = HEAP8[$$0211$i$i$i$i>>0]|0;
             switch ($1697<<24>>24) {
             case 0: case 103:  {
              $$0$i$i$i$i = $$0211$i$i$i$i;$1725 = $1697;
              break L830;
              break;
             }
             default: {
             }
             }
             $1698 = ((($$0211$i$i$i$i)) + 1|0);
             $1699 = $1698;
             $1700 = $1699 & 3;
             $1701 = ($1700|0)==(0);
             if ($1701) {
              $$02$lcssa$i$i$i$i = $1698;
              label = 605;
              break L830;
             } else {
              $$0211$i$i$i$i = $1698;
             }
            }
           }
          } while(0);
          L834: do {
           if ((label|0) == 605) {
            $1702 = HEAP32[$$02$lcssa$i$i$i$i>>2]|0;
            $1703 = (($1702) + -16843009)|0;
            $1704 = $1702 & -2139062144;
            $1705 = $1704 ^ -2139062144;
            $1706 = $1705 & $1703;
            $1707 = ($1706|0)==(0);
            L836: do {
             if ($1707) {
              $1709 = $1702;$w$08$i$i$i$i = $$02$lcssa$i$i$i$i;
              while(1) {
               $1708 = $1709 ^ 1734829927;
               $1710 = (($1708) + -16843009)|0;
               $1711 = $1709 & -2139062144;
               $1712 = $1711 ^ -2139062144;
               $1713 = $1712 & $1710;
               $1714 = ($1713|0)==(0);
               if (!($1714)) {
                $w$0$lcssa$i$i$i$i = $w$08$i$i$i$i;
                break L836;
               }
               $1715 = ((($w$08$i$i$i$i)) + 4|0);
               $1716 = HEAP32[$1715>>2]|0;
               $1717 = (($1716) + -16843009)|0;
               $1718 = $1716 & -2139062144;
               $1719 = $1718 ^ -2139062144;
               $1720 = $1719 & $1717;
               $1721 = ($1720|0)==(0);
               if ($1721) {
                $1709 = $1716;$w$08$i$i$i$i = $1715;
               } else {
                $w$0$lcssa$i$i$i$i = $1715;
                break;
               }
              }
             } else {
              $w$0$lcssa$i$i$i$i = $$02$lcssa$i$i$i$i;
             }
            } while(0);
            $$1$i$i$i$i = $w$0$lcssa$i$i$i$i;
            while(1) {
             $1722 = HEAP8[$$1$i$i$i$i>>0]|0;
             $1723 = ((($$1$i$i$i$i)) + 1|0);
             switch ($1722<<24>>24) {
             case 0: case 103:  {
              $$0$i$i$i$i = $$1$i$i$i$i;$1725 = $1722;
              break L834;
              break;
             }
             default: {
              $$1$i$i$i$i = $1723;
             }
             }
            }
           }
          } while(0);
          $1724 = ($$0$i$i$i$i|0)==(0|0);
          $not$88 = ($1725<<24>>24)!=(103);
          $1726 = $1724 | $not$88;
          if ($1726) {
           $1792 = ($1637|0)==(0|0);
           if ($1792) {
            $$0$i75 = 0;
            break L765;
           } else {
            $fp$0$i = $1637;
            label = 650;
            break L765;
           }
          }
          $1727 = $storemerge | -2147483648;
          HEAP32[$$pre$phi900Z2D>>2] = $1727;
          $1728 = (_malloc(56)|0);
          $1729 = ($1728|0)==(0|0);
          if ($1729) {
           $1734 = ((($1637)) + 68|0);
           HEAP32[$1734>>2] = 0;
           label = 634;
           break;
          }
          $1730 = ((($1728)) + -4|0);
          $1731 = HEAP32[$1730>>2]|0;
          $1732 = $1731 & 3;
          $1733 = ($1732|0)==(0);
          if (!($1733)) {
           dest=$1728; stop=dest+56|0; do { HEAP8[dest>>0]=0|0; dest=dest+1|0; } while ((dest|0) < (stop|0));
          }
          $1735 = ((($1637)) + 68|0);
          HEAP32[$1735>>2] = $1728;
          $1736 = ((($1728)) + 32|0);
          HEAP32[$1736>>2] = 0;
          $1737 = HEAP32[$1735>>2]|0;
          $1738 = ((($1737)) + 36|0);
          HEAP32[$1738>>2] = 0;
          $1739 = HEAP32[$1735>>2]|0;
          $1740 = ((($1739)) + 24|0);
          HEAP32[$1740>>2] = 0;
          $1741 = HEAP32[$1735>>2]|0;
          $1742 = HEAP32[$$pre$phi900Z2D>>2]|0;
          $1743 = $1742 << 3;
          $1744 = $1743 >> 23;
          $1745 = (_deflateInit2_($1741,$1744,8,31,8,0,13743,56)|0);
          $1746 = ($1745|0)==(0);
          if ($1746) {
           $fp$0$i = $1637;
           label = 650;
           break L765;
          }
          $1747 = HEAP32[$1735>>2]|0;
          $1748 = ($1747|0)==(0|0);
          if ($1748) {
           label = 618;
          } else {
           $1749 = ((($1747)) + 24|0);
           $1750 = HEAP32[$1749>>2]|0;
           $1751 = ($1750|0)==(0|0);
           if ($1751) {
            label = 618;
           } else {
            $$0$i$i1$i = $1750;
           }
          }
          L856: do {
           if ((label|0) == 618) {
            switch ($1745|0) {
            case -2:  {
             $$0$i$i1$i = 13468;
             break L856;
             break;
            }
            case -1:  {
             $1752 = HEAP32[4331]|0;
             $1753 = ($1752|0)==(0|0);
             if ($1753) {
              $$0$i$i2$i$i = 17368;
             } else {
              $1754 = (_pthread_self()|0);
              $1755 = ((($1754)) + 64|0);
              $1756 = HEAP32[$1755>>2]|0;
              $$0$i$i2$i$i = $1756;
             }
             $1757 = HEAP32[$$0$i$i2$i$i>>2]|0;
             $i$03$i$i$i$i = 0;
             while(1) {
              $1759 = (15126 + ($i$03$i$i$i$i)|0);
              $1760 = HEAP8[$1759>>0]|0;
              $1761 = $1760&255;
              $1762 = ($1761|0)==($1757|0);
              if ($1762) {
               label = 622;
               break;
              }
              $1763 = (($i$03$i$i$i$i) + 1)|0;
              $1764 = ($1763|0)==(87);
              if ($1764) {
               $i$12$i$i$i$i = 87;$s$01$i$i$i$i = 15214;
               break;
              } else {
               $i$03$i$i$i$i = $1763;
              }
             }
             if ((label|0) == 622) {
              $1758 = ($i$03$i$i$i$i|0)==(0);
              if ($1758) {
               $$0$i$i1$i = 15214;
               break L856;
              } else {
               $i$12$i$i$i$i = $i$03$i$i$i$i;$s$01$i$i$i$i = 15214;
              }
             }
             while(1) {
              $s$1$i$i$i$i = $s$01$i$i$i$i;
              while(1) {
               $1765 = HEAP8[$s$1$i$i$i$i>>0]|0;
               $1766 = ($1765<<24>>24)==(0);
               $1767 = ((($s$1$i$i$i$i)) + 1|0);
               if ($1766) {
                break;
               } else {
                $s$1$i$i$i$i = $1767;
               }
              }
              $1768 = (($i$12$i$i$i$i) + -1)|0;
              $1769 = ($1768|0)==(0);
              if ($1769) {
               $$0$i$i1$i = $1767;
               break;
              } else {
               $i$12$i$i$i$i = $1768;$s$01$i$i$i$i = $1767;
              }
             }
             break;
            }
            case -3:  {
             $$0$i$i1$i = 13534;
             break L856;
             break;
            }
            case -4:  {
             $$0$i$i1$i = 13559;
             break L856;
             break;
            }
            case -5:  {
             $$0$i$i1$i = 13573;
             break L856;
             break;
            }
            case -6:  {
             $$0$i$i1$i = 13642;
             break L856;
             break;
            }
            default: {
             HEAP32[$vararg_buffer6>>2] = $1745;
             _snprintf(17872,32,13664,$vararg_buffer6);
             $$0$i$i1$i = 17872;
             break L856;
            }
            }
           }
          } while(0);
          HEAP32[$vararg_buffer9>>2] = 13710;
          $vararg_ptr12 = ((($vararg_buffer9)) + 4|0);
          HEAP32[$vararg_ptr12>>2] = $$0$i$i1$i;
          _fprintf(9060,13677,$vararg_buffer9);
         }
        } while(0);
        if ((label|0) == 634) {
         $1770 = HEAP32[4331]|0;
         $1771 = ($1770|0)==(0|0);
         if ($1771) {
          $$0$i4$i$i = 17368;
         } else {
          $1772 = (_pthread_self()|0);
          $1773 = ((($1772)) + 64|0);
          $1774 = HEAP32[$1773>>2]|0;
          $$0$i4$i$i = $1774;
         }
         $1775 = HEAP32[$$0$i4$i$i>>2]|0;
         $i$03$i$i$i = 0;
         while(1) {
          $1777 = (15126 + ($i$03$i$i$i)|0);
          $1778 = HEAP8[$1777>>0]|0;
          $1779 = $1778&255;
          $1780 = ($1779|0)==($1775|0);
          if ($1780) {
           label = 637;
           break;
          }
          $1781 = (($i$03$i$i$i) + 1)|0;
          $1782 = ($1781|0)==(87);
          if ($1782) {
           $i$12$i$i$i = 87;$s$01$i$i$i = 15214;
           label = 640;
           break;
          } else {
           $i$03$i$i$i = $1781;
          }
         }
         if ((label|0) == 637) {
          $1776 = ($i$03$i$i$i|0)==(0);
          if ($1776) {
           $s$0$lcssa$i$i$i = 15214;
          } else {
           $i$12$i$i$i = $i$03$i$i$i;$s$01$i$i$i = 15214;
           label = 640;
          }
         }
         if ((label|0) == 640) {
          while(1) {
           label = 0;
           $s$1$i$i$i = $s$01$i$i$i;
           while(1) {
            $1783 = HEAP8[$s$1$i$i$i>>0]|0;
            $1784 = ($1783<<24>>24)==(0);
            $1785 = ((($s$1$i$i$i)) + 1|0);
            if ($1784) {
             break;
            } else {
             $s$1$i$i$i = $1785;
            }
           }
           $1786 = (($i$12$i$i$i) + -1)|0;
           $1787 = ($1786|0)==(0);
           if ($1787) {
            $s$0$lcssa$i$i$i = $1785;
            break;
           } else {
            $i$12$i$i$i = $1786;$s$01$i$i$i = $1785;
            label = 640;
           }
          }
         }
         HEAP32[$vararg_buffer13>>2] = 13710;
         $vararg_ptr16 = ((($vararg_buffer13)) + 4|0);
         HEAP32[$vararg_ptr16>>2] = $s$0$lcssa$i$i$i;
         _fprintf(9060,13726,$vararg_buffer13);
        }
        if ($1638) {
         $$0$i75 = 0;
         break;
        }
        $1788 = ((($1637)) + 40|0);
        $1789 = HEAP32[$1788>>2]|0;
        _free($1789);
        $1790 = ((($1637)) + 68|0);
        $1791 = HEAP32[$1790>>2]|0;
        _free($1791);
        _free($1637);
        $$0$i75 = 0;
       } else {
        $1526 = (_hpeek($hfile,$magic$i$i,18)|0);
        $1527 = ($1526|0)<(0);
        do {
         if (!($1527)) {
          $1528 = (_malloc(72)|0);
          $1529 = ($1528|0)==(0|0);
          if ($1529) {
           break;
          }
          $1530 = ((($1528)) + -4|0);
          $1531 = HEAP32[$1530>>2]|0;
          $1532 = $1531 & 3;
          $1533 = ($1532|0)==(0);
          if ($1533) {
           $$pre889 = HEAP32[$1528>>2]|0;
           $phitmp = $$pre889 & -196609;
           $$pre$phi902Z2D = $1528;$1534 = $phitmp;
          } else {
           dest=$1528; stop=dest+72|0; do { HEAP8[dest>>0]=0|0; dest=dest+1|0; } while ((dest|0) < (stop|0));
           $$pre$phi902Z2D = $1528;$1534 = 0;
          }
          HEAP32[$$pre$phi902Z2D>>2] = $1534;
          $1535 = (_malloc(131072)|0);
          $1536 = ((($1528)) + 40|0);
          HEAP32[$1536>>2] = $1535;
          $1537 = ($1535|0)==(0|0);
          if ($1537) {
           _free($1528);
           break;
          }
          $1538 = ((($1535)) + 65536|0);
          $1539 = ((($1528)) + 44|0);
          HEAP32[$1539>>2] = $1538;
          $1540 = ($1526|0)==(18);
          $1541 = HEAP8[$magic$i$i>>0]|0;
          $1542 = ($1541<<24>>24)==(31);
          $or$cond1631 = $1540 & $1542;
          L909: do {
           if ($or$cond1631) {
            $1545 = ((($magic$i$i)) + 1|0);
            $1546 = HEAP8[$1545>>0]|0;
            $1547 = ($1546<<24>>24)==(-117);
            $1548 = $1547&1;
            $1549 = HEAP32[$$pre$phi902Z2D>>2]|0;
            $1550 = $1548 << 29;
            $1551 = $1549 & -1610612737;
            $1552 = $1551 | $1550;
            HEAP32[$$pre$phi902Z2D>>2] = $1552;
            if (!($1547)) {
             $1566 = $1552;$1568 = -2147483648;
             break;
            }
            $1553 = ((($magic$i$i)) + 3|0);
            $1554 = HEAP8[$1553>>0]|0;
            $1555 = $1554 & 4;
            $1556 = ($1555<<24>>24)==(0);
            if ($1556) {
             $1566 = $1552;$1568 = 0;
             break;
            }
            $1557 = ((($magic$i$i)) + 12|0);
            $$03$i$i$i = 4;$l$04$i$i$i = $1557;$r$05$i$i$i = 13738;
            while(1) {
             $1558 = HEAP8[$l$04$i$i$i>>0]|0;
             $1559 = HEAP8[$r$05$i$i$i>>0]|0;
             $1560 = ($1558<<24>>24)==($1559<<24>>24);
             if (!($1560)) {
              $1566 = $1552;$1568 = 0;
              break L909;
             }
             $1561 = (($$03$i$i$i) + -1)|0;
             $1562 = ((($l$04$i$i$i)) + 1|0);
             $1563 = ((($r$05$i$i$i)) + 1|0);
             $1564 = ($1561|0)==(0);
             if ($1564) {
              $1566 = $1552;$1568 = -2147483648;
              break;
             } else {
              $$03$i$i$i = $1561;$l$04$i$i$i = $1562;$r$05$i$i$i = $1563;
             }
            }
           } else {
            $1543 = HEAP32[$$pre$phi902Z2D>>2]|0;
            $1544 = $1543 & -1610612737;
            HEAP32[$$pre$phi902Z2D>>2] = $1544;
            $1566 = $1544;$1568 = -2147483648;
           }
          } while(0);
          $1565 = $1566 & 2147483647;
          $1567 = $1568 | $1565;
          $1569 = $1567 ^ -2147483648;
          HEAP32[$$pre$phi902Z2D>>2] = $1569;
          $1570 = (_malloc(28)|0);
          $1571 = ($1570|0)==(0|0);
          do {
           if (!($1571)) {
            $1572 = ((($1570)) + -4|0);
            $1573 = HEAP32[$1572>>2]|0;
            $1574 = $1573 & 3;
            $1575 = ($1574|0)==(0);
            if ($1575) {
             break;
            }
            dest=$1570; stop=dest+28|0; do { HEAP8[dest>>0]=0|0; dest=dest+1|0; } while ((dest|0) < (stop|0));
           }
          } while(0);
          $1576 = ((($1528)) + 48|0);
          HEAP32[$1576>>2] = $1570;
          $fp$0$i = $1528;
          label = 650;
          break L765;
         }
        } while(0);
        $$0$i75 = 0;
       }
      } while(0);
      if ((label|0) == 650) {
       $1798 = ((($fp$0$i)) + 52|0);
       HEAP32[$1798>>2] = $hfile;
       $1799 = HEAP32[$fp$0$i>>2]|0;
       $1800 = $1799 & -786433;
       HEAP32[$fp$0$i>>2] = $1800;
       $$0$i75 = $fp$0$i;
      }
      $1801 = ((($0)) + 36|0);
      HEAP32[$1801>>2] = $$0$i75;
      (_puts((17306|0))|0);
      $1802 = HEAP32[$1801>>2]|0;
      $1803 = ($1802|0)==(0|0);
      if (!($1803)) {
       $1804 = HEAP32[$0>>2]|0;
       $1805 = $1804 | 1;
       HEAP32[$0>>2] = $1805;
       $$0 = $0;
       STACKTOP = sp;return ($$0|0);
      }
      break;
     }
     default: {
     }
     }
     HEAP32[$vararg_buffer17>>2] = 13455;
     $vararg_ptr20 = ((($vararg_buffer17)) + 4|0);
     HEAP32[$vararg_ptr20>>2] = $fn;
     _printf(13423,$vararg_buffer17);
     break;
    }
   }
   label = 654;
  }
 } while(0);
 if ((label|0) == 654) {
  HEAP32[$vararg_buffer21>>2] = 13455;
  $vararg_ptr24 = ((($vararg_buffer21)) + 4|0);
  HEAP32[$vararg_ptr24>>2] = $fn;
  _printf(13423,$vararg_buffer21);
 }
 $1806 = HEAP32[$32>>2]|0;
 _free($1806);
 $1807 = ((($0)) + 32|0);
 $1808 = HEAP32[$1807>>2]|0;
 _free($1808);
 _free($0);
 $$0 = 0;
 STACKTOP = sp;return ($$0|0);
}
function _hpeek($fp,$buffer,$nbytes) {
 $fp = $fp|0;
 $buffer = $buffer|0;
 $nbytes = $nbytes|0;
 var $$0 = 0, $$0$i$i = 0, $$cast$i = 0, $$cast2$i = 0, $$pre = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0;
 var $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $n$0 = 0, $nbytes$n$0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($fp)) + 8|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($fp)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = (($1) - ($3))|0;
 $5 = ((($fp)) + 20|0);
 $6 = ((($fp)) + 24|0);
 $7 = ((($fp)) + 12|0);
 $8 = ((($fp)) + 16|0);
 $9 = $1;
 $20 = $1;$55 = $9;$n$0 = $4;
 while(1) {
  $10 = ($n$0>>>0)<($nbytes>>>0);
  if (!($10)) {
   break;
  }
  $11 = HEAP32[$2>>2]|0;
  $12 = HEAP32[$fp>>2]|0;
  $13 = ($11>>>0)>($12>>>0);
  $14 = $11;
  if ($13) {
   $15 = $12;
   $16 = (($14) - ($15))|0;
   $17 = HEAP32[$5>>2]|0;
   $18 = (($17) + ($16))|0;
   HEAP32[$5>>2] = $18;
   $19 = (($20) - ($14))|0;
   _memmove(($12|0),($11|0),($19|0))|0;
   $21 = HEAP32[$0>>2]|0;
   $22 = HEAP32[$2>>2]|0;
   $23 = (($21) - ($22))|0;
   $24 = HEAP32[$fp>>2]|0;
   $25 = (($24) + ($23)|0);
   HEAP32[$0>>2] = $25;
   $$cast2$i = $24;
   HEAP32[$2>>2] = $$cast2$i;
   $31 = $25;
  } else {
   $31 = $55;
  }
  $26 = HEAP8[$6>>0]|0;
  $27 = $26 & 1;
  $28 = ($27<<24>>24)==(0);
  if (!($28)) {
   $48 = $31;
   label = 13;
   break;
  }
  $29 = HEAP32[$7>>2]|0;
  $30 = ($31|0)==($29|0);
  if ($30) {
   $48 = $31;
   label = 13;
   break;
  }
  $32 = $29;
  $33 = HEAP32[$8>>2]|0;
  $34 = HEAP32[$33>>2]|0;
  $$cast$i = $31;
  $35 = (($32) - ($$cast$i))|0;
  $36 = (FUNCTION_TABLE_iiii[$34 & 31]($fp,$31,$35)|0);
  $37 = ($36|0)<(0);
  if ($37) {
   label = 8;
   break;
  }
  $43 = ($36|0)==(0);
  if ($43) {
   label = 11;
   break;
  }
  $49 = HEAP32[$0>>2]|0;
  $50 = (($49) + ($36)|0);
  HEAP32[$0>>2] = $50;
  $51 = (($n$0) + ($36))|0;
  $52 = $50;
  $20 = $52;$55 = $50;$n$0 = $51;
 }
 if ((label|0) == 8) {
  $38 = HEAP32[4331]|0;
  $39 = ($38|0)==(0|0);
  if ($39) {
   $$0$i$i = 17368;
  } else {
   $40 = (_pthread_self()|0);
   $41 = ((($40)) + 64|0);
   $42 = HEAP32[$41>>2]|0;
   $$0$i$i = $42;
  }
  $46 = HEAP32[$$0$i$i>>2]|0;
  $47 = ((($fp)) + 28|0);
  HEAP32[$47>>2] = $46;
  $$0 = $36;
  return ($$0|0);
 }
 else if ((label|0) == 11) {
  $44 = HEAP8[$6>>0]|0;
  $45 = $44 | 1;
  HEAP8[$6>>0] = $45;
  $$pre = HEAP32[$0>>2]|0;
  $48 = $$pre;
  label = 13;
 }
 if ((label|0) == 13) {
  HEAP32[$0>>2] = $48;
 }
 $53 = ($n$0>>>0)>($nbytes>>>0);
 $nbytes$n$0 = $53 ? $nbytes : $n$0;
 $54 = HEAP32[$2>>2]|0;
 _memcpy(($buffer|0),($54|0),($nbytes$n$0|0))|0;
 $$0 = $nbytes$n$0;
 return ($$0|0);
}
function _crc32($crc,$buf,$len) {
 $crc = $crc|0;
 $buf = $buf|0;
 $len = $len|0;
 var $$0 = 0, $$0$i = 0, $$01$i = 0, $$01$i$lcssa = 0, $$1$i = 0, $$12$i = 0, $$2$i = 0, $$3$i = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0;
 var $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0;
 var $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0;
 var $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0;
 var $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0;
 var $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0;
 var $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0;
 var $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0;
 var $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0;
 var $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0;
 var $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0;
 var $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $buf4$0$i = 0, $buf4$1$i = 0, $c$0$i = 0, $c$0$masked$i = 0, $c$1$i = 0, $c$2$i = 0;
 var $c$3$i = 0, $c$3$masked$i = 0, $c$4$i = 0, $scevgep22 = 0, $scevgep24 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($buf|0)==(0|0);
 if ($0) {
  $$0 = 0;
  return ($$0|0);
 }
 $1 = $crc ^ -1;
 $$0$i = $buf;$$01$i = $len;$c$0$i = $1;
 while(1) {
  $2 = ($$01$i|0)==(0);
  if ($2) {
   $$01$i$lcssa = 0;
   break;
  }
  $3 = $$0$i;
  $4 = $3 & 3;
  $5 = ($4|0)==(0);
  if ($5) {
   $$01$i$lcssa = $$01$i;
   break;
  }
  $6 = ((($$0$i)) + 1|0);
  $7 = HEAP8[$$0$i>>0]|0;
  $8 = $7&255;
  $c$0$masked$i = $c$0$i & 255;
  $9 = $c$0$masked$i ^ $8;
  $10 = (140 + ($9<<2)|0);
  $11 = HEAP32[$10>>2]|0;
  $12 = $c$0$i >>> 8;
  $13 = $11 ^ $12;
  $14 = (($$01$i) + -1)|0;
  $$0$i = $6;$$01$i = $14;$c$0$i = $13;
 }
 $15 = ($$01$i$lcssa>>>0)<(31);
 $16 = $15 ? $$01$i$lcssa : 31;
 $17 = $16 ^ -1;
 $18 = (($$01$i$lcssa) + ($17))|0;
 $19 = (($18) + 32)|0;
 $20 = $19 & -32;
 $scevgep24 = (($$0$i) + ($20)|0);
 $$12$i = $$01$i$lcssa;$buf4$0$i = $$0$i;$c$1$i = $c$0$i;
 while(1) {
  $21 = ($$12$i>>>0)>(31);
  if (!($21)) {
   break;
  }
  $30 = ((($buf4$0$i)) + 4|0);
  $31 = HEAP32[$buf4$0$i>>2]|0;
  $32 = $c$1$i ^ $31;
  $33 = $32 & 255;
  $34 = (3212 + ($33<<2)|0);
  $35 = HEAP32[$34>>2]|0;
  $36 = $32 >>> 8;
  $37 = $36 & 255;
  $38 = (2188 + ($37<<2)|0);
  $39 = HEAP32[$38>>2]|0;
  $40 = $35 ^ $39;
  $41 = $32 >>> 16;
  $42 = $41 & 255;
  $43 = (1164 + ($42<<2)|0);
  $44 = HEAP32[$43>>2]|0;
  $45 = $40 ^ $44;
  $46 = $32 >>> 24;
  $47 = (140 + ($46<<2)|0);
  $48 = HEAP32[$47>>2]|0;
  $49 = $45 ^ $48;
  $50 = ((($buf4$0$i)) + 8|0);
  $51 = HEAP32[$30>>2]|0;
  $52 = $49 ^ $51;
  $53 = $52 & 255;
  $54 = (3212 + ($53<<2)|0);
  $55 = HEAP32[$54>>2]|0;
  $56 = $52 >>> 8;
  $57 = $56 & 255;
  $58 = (2188 + ($57<<2)|0);
  $59 = HEAP32[$58>>2]|0;
  $60 = $55 ^ $59;
  $61 = $52 >>> 16;
  $62 = $61 & 255;
  $63 = (1164 + ($62<<2)|0);
  $64 = HEAP32[$63>>2]|0;
  $65 = $60 ^ $64;
  $66 = $52 >>> 24;
  $67 = (140 + ($66<<2)|0);
  $68 = HEAP32[$67>>2]|0;
  $69 = $65 ^ $68;
  $70 = ((($buf4$0$i)) + 12|0);
  $71 = HEAP32[$50>>2]|0;
  $72 = $69 ^ $71;
  $73 = $72 & 255;
  $74 = (3212 + ($73<<2)|0);
  $75 = HEAP32[$74>>2]|0;
  $76 = $72 >>> 8;
  $77 = $76 & 255;
  $78 = (2188 + ($77<<2)|0);
  $79 = HEAP32[$78>>2]|0;
  $80 = $75 ^ $79;
  $81 = $72 >>> 16;
  $82 = $81 & 255;
  $83 = (1164 + ($82<<2)|0);
  $84 = HEAP32[$83>>2]|0;
  $85 = $80 ^ $84;
  $86 = $72 >>> 24;
  $87 = (140 + ($86<<2)|0);
  $88 = HEAP32[$87>>2]|0;
  $89 = $85 ^ $88;
  $90 = ((($buf4$0$i)) + 16|0);
  $91 = HEAP32[$70>>2]|0;
  $92 = $89 ^ $91;
  $93 = $92 & 255;
  $94 = (3212 + ($93<<2)|0);
  $95 = HEAP32[$94>>2]|0;
  $96 = $92 >>> 8;
  $97 = $96 & 255;
  $98 = (2188 + ($97<<2)|0);
  $99 = HEAP32[$98>>2]|0;
  $100 = $95 ^ $99;
  $101 = $92 >>> 16;
  $102 = $101 & 255;
  $103 = (1164 + ($102<<2)|0);
  $104 = HEAP32[$103>>2]|0;
  $105 = $100 ^ $104;
  $106 = $92 >>> 24;
  $107 = (140 + ($106<<2)|0);
  $108 = HEAP32[$107>>2]|0;
  $109 = $105 ^ $108;
  $110 = ((($buf4$0$i)) + 20|0);
  $111 = HEAP32[$90>>2]|0;
  $112 = $109 ^ $111;
  $113 = $112 & 255;
  $114 = (3212 + ($113<<2)|0);
  $115 = HEAP32[$114>>2]|0;
  $116 = $112 >>> 8;
  $117 = $116 & 255;
  $118 = (2188 + ($117<<2)|0);
  $119 = HEAP32[$118>>2]|0;
  $120 = $115 ^ $119;
  $121 = $112 >>> 16;
  $122 = $121 & 255;
  $123 = (1164 + ($122<<2)|0);
  $124 = HEAP32[$123>>2]|0;
  $125 = $120 ^ $124;
  $126 = $112 >>> 24;
  $127 = (140 + ($126<<2)|0);
  $128 = HEAP32[$127>>2]|0;
  $129 = $125 ^ $128;
  $130 = ((($buf4$0$i)) + 24|0);
  $131 = HEAP32[$110>>2]|0;
  $132 = $129 ^ $131;
  $133 = $132 & 255;
  $134 = (3212 + ($133<<2)|0);
  $135 = HEAP32[$134>>2]|0;
  $136 = $132 >>> 8;
  $137 = $136 & 255;
  $138 = (2188 + ($137<<2)|0);
  $139 = HEAP32[$138>>2]|0;
  $140 = $135 ^ $139;
  $141 = $132 >>> 16;
  $142 = $141 & 255;
  $143 = (1164 + ($142<<2)|0);
  $144 = HEAP32[$143>>2]|0;
  $145 = $140 ^ $144;
  $146 = $132 >>> 24;
  $147 = (140 + ($146<<2)|0);
  $148 = HEAP32[$147>>2]|0;
  $149 = $145 ^ $148;
  $150 = ((($buf4$0$i)) + 28|0);
  $151 = HEAP32[$130>>2]|0;
  $152 = $149 ^ $151;
  $153 = $152 & 255;
  $154 = (3212 + ($153<<2)|0);
  $155 = HEAP32[$154>>2]|0;
  $156 = $152 >>> 8;
  $157 = $156 & 255;
  $158 = (2188 + ($157<<2)|0);
  $159 = HEAP32[$158>>2]|0;
  $160 = $155 ^ $159;
  $161 = $152 >>> 16;
  $162 = $161 & 255;
  $163 = (1164 + ($162<<2)|0);
  $164 = HEAP32[$163>>2]|0;
  $165 = $160 ^ $164;
  $166 = $152 >>> 24;
  $167 = (140 + ($166<<2)|0);
  $168 = HEAP32[$167>>2]|0;
  $169 = $165 ^ $168;
  $170 = ((($buf4$0$i)) + 32|0);
  $171 = HEAP32[$150>>2]|0;
  $172 = $169 ^ $171;
  $173 = $172 & 255;
  $174 = (3212 + ($173<<2)|0);
  $175 = HEAP32[$174>>2]|0;
  $176 = $172 >>> 8;
  $177 = $176 & 255;
  $178 = (2188 + ($177<<2)|0);
  $179 = HEAP32[$178>>2]|0;
  $180 = $175 ^ $179;
  $181 = $172 >>> 16;
  $182 = $181 & 255;
  $183 = (1164 + ($182<<2)|0);
  $184 = HEAP32[$183>>2]|0;
  $185 = $180 ^ $184;
  $186 = $172 >>> 24;
  $187 = (140 + ($186<<2)|0);
  $188 = HEAP32[$187>>2]|0;
  $189 = $185 ^ $188;
  $190 = (($$12$i) + -32)|0;
  $$12$i = $190;$buf4$0$i = $170;$c$1$i = $189;
 }
 $22 = (($$01$i$lcssa) - ($20))|0;
 $23 = ($22>>>0)<(3);
 $24 = $23 ? $22 : 3;
 $25 = $24 ^ -1;
 $26 = (($22) + ($25))|0;
 $27 = (($26) + 4)|0;
 $28 = $27 >>> 2;
 $29 = $28 << 2;
 $$2$i = $22;$buf4$1$i = $scevgep24;$c$2$i = $c$1$i;
 while(1) {
  $191 = ($$2$i>>>0)>(3);
  if (!($191)) {
   break;
  }
  $192 = ((($buf4$1$i)) + 4|0);
  $193 = HEAP32[$buf4$1$i>>2]|0;
  $194 = $c$2$i ^ $193;
  $195 = $194 & 255;
  $196 = (3212 + ($195<<2)|0);
  $197 = HEAP32[$196>>2]|0;
  $198 = $194 >>> 8;
  $199 = $198 & 255;
  $200 = (2188 + ($199<<2)|0);
  $201 = HEAP32[$200>>2]|0;
  $202 = $197 ^ $201;
  $203 = $194 >>> 16;
  $204 = $203 & 255;
  $205 = (1164 + ($204<<2)|0);
  $206 = HEAP32[$205>>2]|0;
  $207 = $202 ^ $206;
  $208 = $194 >>> 24;
  $209 = (140 + ($208<<2)|0);
  $210 = HEAP32[$209>>2]|0;
  $211 = $207 ^ $210;
  $212 = (($$2$i) + -4)|0;
  $$2$i = $212;$buf4$1$i = $192;$c$2$i = $211;
 }
 $213 = ($22|0)==($29|0);
 if ($213) {
  $c$4$i = $c$2$i;
 } else {
  $214 = (($22) - ($29))|0;
  $scevgep22 = (($scevgep24) + ($28<<2)|0);
  $$1$i = $scevgep22;$$3$i = $214;$c$3$i = $c$2$i;
  while(1) {
   $215 = HEAP8[$$1$i>>0]|0;
   $216 = $215&255;
   $c$3$masked$i = $c$3$i & 255;
   $217 = $c$3$masked$i ^ $216;
   $218 = (140 + ($217<<2)|0);
   $219 = HEAP32[$218>>2]|0;
   $220 = $c$3$i >>> 8;
   $221 = $219 ^ $220;
   $222 = ((($$1$i)) + 1|0);
   $223 = (($$3$i) + -1)|0;
   $224 = ($223|0)==(0);
   if ($224) {
    $c$4$i = $221;
    break;
   } else {
    $$1$i = $222;$$3$i = $223;$c$3$i = $221;
   }
  }
 }
 $225 = $c$4$i ^ -1;
 $$0 = $225;
 return ($$0|0);
}
function _deflateInit2_($strm,$level,$method,$windowBits,$memLevel,$strategy,$version,$stream_size) {
 $strm = $strm|0;
 $level = $level|0;
 $method = $method|0;
 $windowBits = $windowBits|0;
 $memLevel = $memLevel|0;
 $strategy = $strategy|0;
 $version = $version|0;
 $stream_size = $stream_size|0;
 var $$ = 0, $$$1 = 0, $$0 = 0, $$1 = 0, $$21 = 0, $$in = 0, $$in10 = 0, $$in11 = 0, $$level = 0, $$pre = 0, $$pre5 = 0, $$pre6 = 0, $$pre7 = 0, $$windowBits = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0;
 var $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0;
 var $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0;
 var $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0;
 var $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0;
 var $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0;
 var $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0;
 var $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $exitcond = 0, $exitcond8 = 0, $exitcond9 = 0;
 var $memLevel$off = 0, $n$0$i$i$i$i = 0, $n$1$i$i$i$i = 0, $n$2$i$i$i$i = 0, $not$ = 0, $notlhs = 0, $notrhs = 0, $or$cond = 0, $or$cond13$not = 0, $or$cond20 = 0, $wrap$1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($version|0)==(0|0);
 if ($0) {
  $$0 = -6;
  return ($$0|0);
 }
 $1 = HEAP8[$version>>0]|0;
 $2 = ($1<<24>>24)==(49);
 $3 = ($stream_size|0)==(56);
 $or$cond = $2 & $3;
 if (!($or$cond)) {
  $$0 = -6;
  return ($$0|0);
 }
 $4 = ($strm|0)==(0|0);
 if ($4) {
  $$0 = -2;
  return ($$0|0);
 }
 $5 = ((($strm)) + 24|0);
 HEAP32[$5>>2] = 0;
 $6 = ((($strm)) + 32|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)==(0|0);
 if ($8) {
  HEAP32[$6>>2] = 28;
  $9 = ((($strm)) + 40|0);
  HEAP32[$9>>2] = 0;
  $28 = 28;
 } else {
  $28 = $7;
 }
 $10 = ((($strm)) + 36|0);
 $11 = HEAP32[$10>>2]|0;
 $12 = ($11|0)==(0|0);
 if ($12) {
  HEAP32[$10>>2] = 29;
 }
 $13 = ($level|0)==(-1);
 $$level = $13 ? 6 : $level;
 $14 = ($windowBits|0)<(0);
 if ($14) {
  $15 = (0 - ($windowBits))|0;
  $$1 = $15;$wrap$1 = 0;
 } else {
  $16 = ($windowBits|0)>(15);
  $17 = (($windowBits) + -16)|0;
  $$windowBits = $16 ? $17 : $windowBits;
  $$ = $16 ? 2 : 1;
  $$1 = $$windowBits;$wrap$1 = $$;
 }
 $memLevel$off = (($memLevel) + -1)|0;
 $notlhs = ($memLevel$off>>>0)>(8);
 $notrhs = ($method|0)!=(8);
 $or$cond13$not = $notrhs | $notlhs;
 $18 = $$1 & -8;
 $19 = ($18|0)!=(8);
 $20 = $19 | $or$cond13$not;
 $21 = ($$level>>>0)>(9);
 $22 = $21 | $20;
 $23 = ($strategy>>>0)>(4);
 $24 = $23 | $22;
 if ($24) {
  $$0 = -2;
  return ($$0|0);
 }
 $25 = ($$1|0)==(8);
 $$$1 = $25 ? 9 : $$1;
 $26 = ((($strm)) + 40|0);
 $27 = HEAP32[$26>>2]|0;
 $29 = (FUNCTION_TABLE_iiii[$28 & 31]($27,1,5828)|0);
 $30 = ($29|0)==(0|0);
 if ($30) {
  $$0 = -4;
  return ($$0|0);
 }
 $31 = ((($strm)) + 28|0);
 HEAP32[$31>>2] = $29;
 HEAP32[$29>>2] = $strm;
 $32 = ((($29)) + 24|0);
 HEAP32[$32>>2] = $wrap$1;
 $33 = ((($29)) + 28|0);
 HEAP32[$33>>2] = 0;
 $34 = ((($29)) + 48|0);
 HEAP32[$34>>2] = $$$1;
 $35 = 1 << $$$1;
 $36 = ((($29)) + 44|0);
 HEAP32[$36>>2] = $35;
 $37 = (($35) + -1)|0;
 $38 = ((($29)) + 52|0);
 HEAP32[$38>>2] = $37;
 $39 = (($memLevel) + 7)|0;
 $40 = ((($29)) + 80|0);
 HEAP32[$40>>2] = $39;
 $41 = 1 << $39;
 $42 = ((($29)) + 76|0);
 HEAP32[$42>>2] = $41;
 $43 = (($41) + -1)|0;
 $44 = ((($29)) + 84|0);
 HEAP32[$44>>2] = $43;
 $45 = (($memLevel) + 9)|0;
 $46 = (($45>>>0) / 3)&-1;
 $47 = ((($29)) + 88|0);
 HEAP32[$47>>2] = $46;
 $48 = HEAP32[$6>>2]|0;
 $49 = HEAP32[$26>>2]|0;
 $50 = (FUNCTION_TABLE_iiii[$48 & 31]($49,$35,2)|0);
 $51 = ((($29)) + 56|0);
 HEAP32[$51>>2] = $50;
 $52 = HEAP32[$6>>2]|0;
 $53 = HEAP32[$26>>2]|0;
 $54 = HEAP32[$36>>2]|0;
 $55 = (FUNCTION_TABLE_iiii[$52 & 31]($53,$54,2)|0);
 $56 = ((($29)) + 64|0);
 HEAP32[$56>>2] = $55;
 $57 = HEAP32[$6>>2]|0;
 $58 = HEAP32[$26>>2]|0;
 $59 = HEAP32[$42>>2]|0;
 $60 = (FUNCTION_TABLE_iiii[$57 & 31]($58,$59,2)|0);
 $61 = ((($29)) + 68|0);
 HEAP32[$61>>2] = $60;
 $62 = ((($29)) + 5824|0);
 HEAP32[$62>>2] = 0;
 $63 = (($memLevel) + 6)|0;
 $64 = 1 << $63;
 $65 = ((($29)) + 5788|0);
 HEAP32[$65>>2] = $64;
 $66 = HEAP32[$6>>2]|0;
 $67 = HEAP32[$26>>2]|0;
 $68 = (FUNCTION_TABLE_iiii[$66 & 31]($67,$64,4)|0);
 $69 = ((($29)) + 8|0);
 HEAP32[$69>>2] = $68;
 $70 = HEAP32[$65>>2]|0;
 $71 = $70 << 2;
 $72 = ((($29)) + 12|0);
 HEAP32[$72>>2] = $71;
 $73 = HEAP32[$51>>2]|0;
 $74 = ($73|0)==(0|0);
 if (!($74)) {
  $75 = HEAP32[$56>>2]|0;
  $76 = ($75|0)==(0|0);
  if (!($76)) {
   $77 = HEAP32[$61>>2]|0;
   $78 = ($77|0)==(0|0);
   $79 = ($68|0)==(0|0);
   $or$cond20 = $78 | $79;
   if (!($or$cond20)) {
    $108 = $70 >>> 1;
    $109 = (($68) + ($108<<1)|0);
    $110 = ((($29)) + 5796|0);
    HEAP32[$110>>2] = $109;
    $111 = ($70*3)|0;
    $112 = (($68) + ($111)|0);
    $113 = ((($29)) + 5784|0);
    HEAP32[$113>>2] = $112;
    $114 = ((($29)) + 132|0);
    HEAP32[$114>>2] = $$level;
    $115 = ((($29)) + 136|0);
    HEAP32[$115>>2] = $strategy;
    $116 = ((($29)) + 36|0);
    HEAP8[$116>>0] = 8;
    $117 = HEAP32[$31>>2]|0;
    $118 = ($117|0)==(0|0);
    if ($118) {
     $$0 = -2;
     return ($$0|0);
    }
    $119 = HEAP32[$6>>2]|0;
    $120 = ($119|0)==(0|0);
    if ($120) {
     $$0 = -2;
     return ($$0|0);
    }
    $121 = HEAP32[$10>>2]|0;
    $122 = ($121|0)==(0|0);
    if ($122) {
     $$0 = -2;
     return ($$0|0);
    }
    $123 = ((($strm)) + 20|0);
    HEAP32[$123>>2] = 0;
    $124 = ((($strm)) + 8|0);
    HEAP32[$124>>2] = 0;
    HEAP32[$5>>2] = 0;
    $125 = ((($strm)) + 44|0);
    HEAP32[$125>>2] = 2;
    $126 = ((($117)) + 20|0);
    HEAP32[$126>>2] = 0;
    $127 = ((($117)) + 8|0);
    $128 = HEAP32[$127>>2]|0;
    $129 = ((($117)) + 16|0);
    HEAP32[$129>>2] = $128;
    $130 = ((($117)) + 24|0);
    $131 = HEAP32[$130>>2]|0;
    $132 = ($131|0)<(0);
    if ($132) {
     $133 = (0 - ($131))|0;
     HEAP32[$130>>2] = $133;
     $135 = $133;
    } else {
     $135 = $131;
    }
    $134 = ($135|0)!=(0);
    $136 = $134 ? 42 : 113;
    $137 = ((($117)) + 4|0);
    HEAP32[$137>>2] = $136;
    $not$ = ($135|0)!=(2);
    $$21 = $not$&1;
    $138 = ((($strm)) + 48|0);
    HEAP32[$138>>2] = $$21;
    $139 = ((($117)) + 40|0);
    HEAP32[$139>>2] = 0;
    $140 = ((($117)) + 148|0);
    $141 = ((($117)) + 2840|0);
    HEAP32[$141>>2] = $140;
    $142 = ((($117)) + 2848|0);
    HEAP32[$142>>2] = 8452;
    $143 = ((($117)) + 2440|0);
    $144 = ((($117)) + 2852|0);
    HEAP32[$144>>2] = $143;
    $145 = ((($117)) + 2860|0);
    HEAP32[$145>>2] = 8588;
    $146 = ((($117)) + 2684|0);
    $147 = ((($117)) + 2864|0);
    HEAP32[$147>>2] = $146;
    $148 = ((($117)) + 2872|0);
    HEAP32[$148>>2] = 8728;
    $149 = ((($117)) + 5816|0);
    HEAP16[$149>>1] = 0;
    $150 = ((($117)) + 5820|0);
    HEAP32[$150>>2] = 0;
    $n$0$i$i$i$i = 0;
    while(1) {
     $exitcond9 = ($n$0$i$i$i$i|0)==(286);
     if ($exitcond9) {
      $n$1$i$i$i$i = 0;
      break;
     }
     $151 = (((($117)) + 148|0) + ($n$0$i$i$i$i<<2)|0);
     HEAP16[$151>>1] = 0;
     $152 = (($n$0$i$i$i$i) + 1)|0;
     $n$0$i$i$i$i = $152;
    }
    while(1) {
     $exitcond8 = ($n$1$i$i$i$i|0)==(30);
     if ($exitcond8) {
      $n$2$i$i$i$i = 0;
      break;
     }
     $153 = (((($117)) + 2440|0) + ($n$1$i$i$i$i<<2)|0);
     HEAP16[$153>>1] = 0;
     $154 = (($n$1$i$i$i$i) + 1)|0;
     $n$1$i$i$i$i = $154;
    }
    while(1) {
     $exitcond = ($n$2$i$i$i$i|0)==(19);
     if ($exitcond) {
      break;
     }
     $155 = (((($117)) + 2684|0) + ($n$2$i$i$i$i<<2)|0);
     HEAP16[$155>>1] = 0;
     $156 = (($n$2$i$i$i$i) + 1)|0;
     $n$2$i$i$i$i = $156;
    }
    $157 = ((($117)) + 1172|0);
    HEAP16[$157>>1] = 1;
    $158 = ((($117)) + 5804|0);
    HEAP32[$158>>2] = 0;
    $159 = ((($117)) + 5800|0);
    HEAP32[$159>>2] = 0;
    $160 = ((($117)) + 5808|0);
    HEAP32[$160>>2] = 0;
    $161 = ((($117)) + 5792|0);
    HEAP32[$161>>2] = 0;
    $162 = HEAP32[$31>>2]|0;
    $163 = ((($162)) + 44|0);
    $164 = HEAP32[$163>>2]|0;
    $165 = $164 << 1;
    $166 = ((($162)) + 60|0);
    HEAP32[$166>>2] = $165;
    $167 = ((($162)) + 76|0);
    $168 = HEAP32[$167>>2]|0;
    $169 = (($168) + -1)|0;
    $170 = ((($162)) + 68|0);
    $171 = HEAP32[$170>>2]|0;
    $172 = (($171) + ($169<<1)|0);
    HEAP16[$172>>1] = 0;
    $173 = HEAP32[$170>>2]|0;
    $174 = HEAP32[$167>>2]|0;
    $175 = $174 << 1;
    $176 = (($175) + -2)|0;
    _memset(($173|0),0,($176|0))|0;
    $177 = ((($162)) + 132|0);
    $178 = HEAP32[$177>>2]|0;
    $179 = (((8332 + (($178*12)|0)|0)) + 2|0);
    $180 = HEAP16[$179>>1]|0;
    $181 = $180&65535;
    $182 = ((($162)) + 128|0);
    HEAP32[$182>>2] = $181;
    $183 = (8332 + (($178*12)|0)|0);
    $184 = HEAP16[$183>>1]|0;
    $185 = $184&65535;
    $186 = ((($162)) + 140|0);
    HEAP32[$186>>2] = $185;
    $187 = (((8332 + (($178*12)|0)|0)) + 4|0);
    $188 = HEAP16[$187>>1]|0;
    $189 = $188&65535;
    $190 = ((($162)) + 144|0);
    HEAP32[$190>>2] = $189;
    $191 = (((8332 + (($178*12)|0)|0)) + 6|0);
    $192 = HEAP16[$191>>1]|0;
    $193 = $192&65535;
    $194 = ((($162)) + 124|0);
    HEAP32[$194>>2] = $193;
    $195 = ((($162)) + 108|0);
    HEAP32[$195>>2] = 0;
    $196 = ((($162)) + 92|0);
    HEAP32[$196>>2] = 0;
    $197 = ((($162)) + 116|0);
    HEAP32[$197>>2] = 0;
    $198 = ((($162)) + 5812|0);
    HEAP32[$198>>2] = 0;
    $199 = ((($162)) + 120|0);
    HEAP32[$199>>2] = 2;
    $200 = ((($162)) + 96|0);
    HEAP32[$200>>2] = 2;
    $201 = ((($162)) + 104|0);
    HEAP32[$201>>2] = 0;
    $202 = ((($162)) + 72|0);
    HEAP32[$202>>2] = 0;
    $$0 = 0;
    return ($$0|0);
   }
  }
 }
 $80 = ((($29)) + 4|0);
 HEAP32[$80>>2] = 666;
 HEAP32[$5>>2] = 14616;
 $81 = HEAP32[$31>>2]|0;
 $82 = ($81|0)==(0|0);
 if ($82) {
  $$0 = -4;
  return ($$0|0);
 }
 $83 = ((($81)) + 4|0);
 $84 = HEAP32[$83>>2]|0;
 switch ($84|0) {
 case 666: case 113: case 103: case 91: case 73: case 69: case 42:  {
  break;
 }
 default: {
  $$0 = -4;
  return ($$0|0);
 }
 }
 $85 = ((($81)) + 8|0);
 $86 = HEAP32[$85>>2]|0;
 $87 = ($86|0)==(0|0);
 if ($87) {
  $$in = $81;
 } else {
  $88 = HEAP32[$10>>2]|0;
  $89 = HEAP32[$26>>2]|0;
  FUNCTION_TABLE_vii[$88 & 31]($89,$86);
  $$pre = HEAP32[$31>>2]|0;
  $$in = $$pre;
 }
 $90 = ((($$in)) + 68|0);
 $91 = HEAP32[$90>>2]|0;
 $92 = ($91|0)==(0|0);
 if ($92) {
  $$in10 = $$in;
 } else {
  $93 = HEAP32[$10>>2]|0;
  $94 = HEAP32[$26>>2]|0;
  FUNCTION_TABLE_vii[$93 & 31]($94,$91);
  $$pre5 = HEAP32[$31>>2]|0;
  $$in10 = $$pre5;
 }
 $95 = ((($$in10)) + 64|0);
 $96 = HEAP32[$95>>2]|0;
 $97 = ($96|0)==(0|0);
 if ($97) {
  $$in11 = $$in10;
 } else {
  $98 = HEAP32[$10>>2]|0;
  $99 = HEAP32[$26>>2]|0;
  FUNCTION_TABLE_vii[$98 & 31]($99,$96);
  $$pre6 = HEAP32[$31>>2]|0;
  $$in11 = $$pre6;
 }
 $100 = ((($$in11)) + 56|0);
 $101 = HEAP32[$100>>2]|0;
 $102 = ($101|0)==(0|0);
 if ($102) {
  $107 = $$in11;
 } else {
  $103 = HEAP32[$10>>2]|0;
  $104 = HEAP32[$26>>2]|0;
  FUNCTION_TABLE_vii[$103 & 31]($104,$101);
  $$pre7 = HEAP32[$31>>2]|0;
  $107 = $$pre7;
 }
 $105 = HEAP32[$10>>2]|0;
 $106 = HEAP32[$26>>2]|0;
 FUNCTION_TABLE_vii[$105 & 31]($106,$107);
 HEAP32[$31>>2] = 0;
 $$0 = -4;
 return ($$0|0);
}
function _deflate_stored($s,$flush) {
 $s = $s|0;
 $flush = $flush|0;
 var $$ = 0, $$0 = 0, $$19 = 0, $$20 = 0, $$21 = 0, $$22 = 0, $$23 = 0, $$not = 0, $$not18 = 0, $$pre = 0, $$pre$phi13Z2D = 0, $$pre$phi15Z2D = 0, $$pre$phi17Z2D = 0, $$pre$phiZ2D = 0, $$pre10 = 0, $$pre11 = 0, $$pre12 = 0, $$pre14 = 0, $$pre16 = 0, $0 = 0;
 var $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0;
 var $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0;
 var $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0;
 var $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0;
 var $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0;
 var $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0;
 var $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0;
 var $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0;
 var $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0;
 var $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0;
 var $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0;
 var $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0;
 var $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0;
 var $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0;
 var $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0;
 var $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $brmerge = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($s)) + 12|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = (($1) + -5)|0;
 $3 = ($2>>>0)<(65535);
 $$ = $3 ? $2 : 65535;
 $4 = ((($s)) + 116|0);
 $5 = ((($s)) + 108|0);
 $6 = ((($s)) + 92|0);
 $7 = ((($s)) + 56|0);
 $8 = ((($s)) + 44|0);
 while(1) {
  $9 = HEAP32[$4>>2]|0;
  $10 = ($9>>>0)<(2);
  if ($10) {
   _fill_window($s);
   $11 = HEAP32[$4>>2]|0;
   $12 = ($11|0)==(0);
   $$not = $12 ^ 1;
   $$not18 = ($flush|0)!=(0);
   $brmerge = $$not18 | $$not;
   if (!($brmerge)) {
    $$0 = 0;
    label = 55;
    break;
   }
   if ($12) {
    label = 30;
    break;
   } else {
    $15 = $11;
   }
  } else {
   $15 = $9;
  }
  $13 = HEAP32[$5>>2]|0;
  $14 = (($13) + ($15))|0;
  HEAP32[$5>>2] = $14;
  HEAP32[$4>>2] = 0;
  $16 = HEAP32[$6>>2]|0;
  $17 = (($16) + ($$))|0;
  $18 = ($14|0)!=(0);
  $19 = ($14>>>0)<($17>>>0);
  $or$cond = $18 & $19;
  if ($or$cond) {
   $90 = $14;$91 = $16;
  } else {
   $20 = (($14) - ($17))|0;
   HEAP32[$4>>2] = $20;
   HEAP32[$5>>2] = $17;
   $21 = ($16|0)>(-1);
   if ($21) {
    $22 = HEAP32[$7>>2]|0;
    $23 = (($22) + ($16)|0);
    $24 = $23;
   } else {
    $24 = 0;
   }
   __tr_flush_block($s,$24,$$,0);
   $25 = HEAP32[$5>>2]|0;
   HEAP32[$6>>2] = $25;
   $26 = HEAP32[$s>>2]|0;
   $27 = ((($26)) + 28|0);
   $28 = HEAP32[$27>>2]|0;
   $29 = ((($28)) + 5820|0);
   $30 = HEAP32[$29>>2]|0;
   $31 = ($30|0)==(16);
   do {
    if ($31) {
     $32 = ((($28)) + 5816|0);
     $33 = HEAP16[$32>>1]|0;
     $34 = $33&255;
     $35 = ((($28)) + 20|0);
     $36 = HEAP32[$35>>2]|0;
     $37 = (($36) + 1)|0;
     HEAP32[$35>>2] = $37;
     $38 = ((($28)) + 8|0);
     $39 = HEAP32[$38>>2]|0;
     $40 = (($39) + ($36)|0);
     HEAP8[$40>>0] = $34;
     $41 = HEAP16[$32>>1]|0;
     $42 = ($41&65535) >>> 8;
     $43 = $42&255;
     $44 = HEAP32[$35>>2]|0;
     $45 = (($44) + 1)|0;
     HEAP32[$35>>2] = $45;
     $46 = HEAP32[$38>>2]|0;
     $47 = (($46) + ($44)|0);
     HEAP8[$47>>0] = $43;
     HEAP16[$32>>1] = 0;
     HEAP32[$29>>2] = 0;
     $$pre$phi15Z2D = $35;
    } else {
     $48 = ($30|0)>(7);
     if ($48) {
      $49 = ((($28)) + 5816|0);
      $50 = HEAP16[$49>>1]|0;
      $51 = $50&255;
      $52 = ((($28)) + 20|0);
      $53 = HEAP32[$52>>2]|0;
      $54 = (($53) + 1)|0;
      HEAP32[$52>>2] = $54;
      $55 = ((($28)) + 8|0);
      $56 = HEAP32[$55>>2]|0;
      $57 = (($56) + ($53)|0);
      HEAP8[$57>>0] = $51;
      $58 = HEAP16[$49>>1]|0;
      $59 = ($58&65535) >>> 8;
      HEAP16[$49>>1] = $59;
      $60 = HEAP32[$29>>2]|0;
      $61 = (($60) + -8)|0;
      HEAP32[$29>>2] = $61;
      $$pre$phi15Z2D = $52;
      break;
     } else {
      $$pre14 = ((($28)) + 20|0);
      $$pre$phi15Z2D = $$pre14;
      break;
     }
    }
   } while(0);
   $62 = HEAP32[$$pre$phi15Z2D>>2]|0;
   $63 = ((($26)) + 16|0);
   $64 = HEAP32[$63>>2]|0;
   $65 = ($62>>>0)>($64>>>0);
   $$19 = $65 ? $64 : $62;
   $66 = ($$19|0)==(0);
   if (!($66)) {
    $67 = ((($26)) + 12|0);
    $68 = HEAP32[$67>>2]|0;
    $69 = ((($28)) + 16|0);
    $70 = HEAP32[$69>>2]|0;
    _memcpy(($68|0),($70|0),($$19|0))|0;
    $71 = HEAP32[$67>>2]|0;
    $72 = (($71) + ($$19)|0);
    HEAP32[$67>>2] = $72;
    $73 = HEAP32[$69>>2]|0;
    $74 = (($73) + ($$19)|0);
    HEAP32[$69>>2] = $74;
    $75 = ((($26)) + 20|0);
    $76 = HEAP32[$75>>2]|0;
    $77 = (($76) + ($$19))|0;
    HEAP32[$75>>2] = $77;
    $78 = HEAP32[$63>>2]|0;
    $79 = (($78) - ($$19))|0;
    HEAP32[$63>>2] = $79;
    $80 = HEAP32[$$pre$phi15Z2D>>2]|0;
    $81 = (($80) - ($$19))|0;
    HEAP32[$$pre$phi15Z2D>>2] = $81;
    $82 = ($80|0)==($$19|0);
    if ($82) {
     $83 = ((($28)) + 8|0);
     $84 = HEAP32[$83>>2]|0;
     HEAP32[$69>>2] = $84;
    }
   }
   $85 = HEAP32[$s>>2]|0;
   $86 = ((($85)) + 16|0);
   $87 = HEAP32[$86>>2]|0;
   $88 = ($87|0)==(0);
   if ($88) {
    $$0 = 0;
    label = 55;
    break;
   }
   $$pre = HEAP32[$5>>2]|0;
   $$pre10 = HEAP32[$6>>2]|0;
   $90 = $$pre;$91 = $$pre10;
  }
  $89 = (($90) - ($91))|0;
  $92 = HEAP32[$8>>2]|0;
  $93 = (($92) + -262)|0;
  $94 = ($89>>>0)<($93>>>0);
  if ($94) {
   continue;
  }
  $95 = ($91|0)>(-1);
  if ($95) {
   $96 = HEAP32[$7>>2]|0;
   $97 = (($96) + ($91)|0);
   $98 = $97;
  } else {
   $98 = 0;
  }
  __tr_flush_block($s,$98,$89,0);
  $99 = HEAP32[$5>>2]|0;
  HEAP32[$6>>2] = $99;
  $100 = HEAP32[$s>>2]|0;
  $101 = ((($100)) + 28|0);
  $102 = HEAP32[$101>>2]|0;
  $103 = ((($102)) + 5820|0);
  $104 = HEAP32[$103>>2]|0;
  $105 = ($104|0)==(16);
  do {
   if ($105) {
    $106 = ((($102)) + 5816|0);
    $107 = HEAP16[$106>>1]|0;
    $108 = $107&255;
    $109 = ((($102)) + 20|0);
    $110 = HEAP32[$109>>2]|0;
    $111 = (($110) + 1)|0;
    HEAP32[$109>>2] = $111;
    $112 = ((($102)) + 8|0);
    $113 = HEAP32[$112>>2]|0;
    $114 = (($113) + ($110)|0);
    HEAP8[$114>>0] = $108;
    $115 = HEAP16[$106>>1]|0;
    $116 = ($115&65535) >>> 8;
    $117 = $116&255;
    $118 = HEAP32[$109>>2]|0;
    $119 = (($118) + 1)|0;
    HEAP32[$109>>2] = $119;
    $120 = HEAP32[$112>>2]|0;
    $121 = (($120) + ($118)|0);
    HEAP8[$121>>0] = $117;
    HEAP16[$106>>1] = 0;
    HEAP32[$103>>2] = 0;
    $$pre$phi17Z2D = $109;
   } else {
    $122 = ($104|0)>(7);
    if ($122) {
     $123 = ((($102)) + 5816|0);
     $124 = HEAP16[$123>>1]|0;
     $125 = $124&255;
     $126 = ((($102)) + 20|0);
     $127 = HEAP32[$126>>2]|0;
     $128 = (($127) + 1)|0;
     HEAP32[$126>>2] = $128;
     $129 = ((($102)) + 8|0);
     $130 = HEAP32[$129>>2]|0;
     $131 = (($130) + ($127)|0);
     HEAP8[$131>>0] = $125;
     $132 = HEAP16[$123>>1]|0;
     $133 = ($132&65535) >>> 8;
     HEAP16[$123>>1] = $133;
     $134 = HEAP32[$103>>2]|0;
     $135 = (($134) + -8)|0;
     HEAP32[$103>>2] = $135;
     $$pre$phi17Z2D = $126;
     break;
    } else {
     $$pre16 = ((($102)) + 20|0);
     $$pre$phi17Z2D = $$pre16;
     break;
    }
   }
  } while(0);
  $136 = HEAP32[$$pre$phi17Z2D>>2]|0;
  $137 = ((($100)) + 16|0);
  $138 = HEAP32[$137>>2]|0;
  $139 = ($136>>>0)>($138>>>0);
  $$20 = $139 ? $138 : $136;
  $140 = ($$20|0)==(0);
  if (!($140)) {
   $141 = ((($100)) + 12|0);
   $142 = HEAP32[$141>>2]|0;
   $143 = ((($102)) + 16|0);
   $144 = HEAP32[$143>>2]|0;
   _memcpy(($142|0),($144|0),($$20|0))|0;
   $145 = HEAP32[$141>>2]|0;
   $146 = (($145) + ($$20)|0);
   HEAP32[$141>>2] = $146;
   $147 = HEAP32[$143>>2]|0;
   $148 = (($147) + ($$20)|0);
   HEAP32[$143>>2] = $148;
   $149 = ((($100)) + 20|0);
   $150 = HEAP32[$149>>2]|0;
   $151 = (($150) + ($$20))|0;
   HEAP32[$149>>2] = $151;
   $152 = HEAP32[$137>>2]|0;
   $153 = (($152) - ($$20))|0;
   HEAP32[$137>>2] = $153;
   $154 = HEAP32[$$pre$phi17Z2D>>2]|0;
   $155 = (($154) - ($$20))|0;
   HEAP32[$$pre$phi17Z2D>>2] = $155;
   $156 = ($154|0)==($$20|0);
   if ($156) {
    $157 = ((($102)) + 8|0);
    $158 = HEAP32[$157>>2]|0;
    HEAP32[$143>>2] = $158;
   }
  }
  $159 = HEAP32[$s>>2]|0;
  $160 = ((($159)) + 16|0);
  $161 = HEAP32[$160>>2]|0;
  $162 = ($161|0)==(0);
  if ($162) {
   $$0 = 0;
   label = 55;
   break;
  }
 }
 if ((label|0) == 30) {
  $163 = ((($s)) + 5812|0);
  HEAP32[$163>>2] = 0;
  $164 = ($flush|0)==(4);
  if ($164) {
   $165 = HEAP32[$6>>2]|0;
   $166 = ($165|0)>(-1);
   if ($166) {
    $167 = HEAP32[$7>>2]|0;
    $168 = (($167) + ($165)|0);
    $171 = $168;
   } else {
    $171 = 0;
   }
   $169 = HEAP32[$5>>2]|0;
   $170 = (($169) - ($165))|0;
   __tr_flush_block($s,$171,$170,1);
   $172 = HEAP32[$5>>2]|0;
   HEAP32[$6>>2] = $172;
   $173 = HEAP32[$s>>2]|0;
   $174 = ((($173)) + 28|0);
   $175 = HEAP32[$174>>2]|0;
   $176 = ((($175)) + 5820|0);
   $177 = HEAP32[$176>>2]|0;
   $178 = ($177|0)==(16);
   do {
    if ($178) {
     $179 = ((($175)) + 5816|0);
     $180 = HEAP16[$179>>1]|0;
     $181 = $180&255;
     $182 = ((($175)) + 20|0);
     $183 = HEAP32[$182>>2]|0;
     $184 = (($183) + 1)|0;
     HEAP32[$182>>2] = $184;
     $185 = ((($175)) + 8|0);
     $186 = HEAP32[$185>>2]|0;
     $187 = (($186) + ($183)|0);
     HEAP8[$187>>0] = $181;
     $188 = HEAP16[$179>>1]|0;
     $189 = ($188&65535) >>> 8;
     $190 = $189&255;
     $191 = HEAP32[$182>>2]|0;
     $192 = (($191) + 1)|0;
     HEAP32[$182>>2] = $192;
     $193 = HEAP32[$185>>2]|0;
     $194 = (($193) + ($191)|0);
     HEAP8[$194>>0] = $190;
     HEAP16[$179>>1] = 0;
     HEAP32[$176>>2] = 0;
     $$pre$phiZ2D = $182;
    } else {
     $195 = ($177|0)>(7);
     if ($195) {
      $196 = ((($175)) + 5816|0);
      $197 = HEAP16[$196>>1]|0;
      $198 = $197&255;
      $199 = ((($175)) + 20|0);
      $200 = HEAP32[$199>>2]|0;
      $201 = (($200) + 1)|0;
      HEAP32[$199>>2] = $201;
      $202 = ((($175)) + 8|0);
      $203 = HEAP32[$202>>2]|0;
      $204 = (($203) + ($200)|0);
      HEAP8[$204>>0] = $198;
      $205 = HEAP16[$196>>1]|0;
      $206 = ($205&65535) >>> 8;
      HEAP16[$196>>1] = $206;
      $207 = HEAP32[$176>>2]|0;
      $208 = (($207) + -8)|0;
      HEAP32[$176>>2] = $208;
      $$pre$phiZ2D = $199;
      break;
     } else {
      $$pre11 = ((($175)) + 20|0);
      $$pre$phiZ2D = $$pre11;
      break;
     }
    }
   } while(0);
   $209 = HEAP32[$$pre$phiZ2D>>2]|0;
   $210 = ((($173)) + 16|0);
   $211 = HEAP32[$210>>2]|0;
   $212 = ($209>>>0)>($211>>>0);
   $$21 = $212 ? $211 : $209;
   $213 = ($$21|0)==(0);
   if ($213) {
    $232 = HEAP32[$s>>2]|0;
    $233 = ((($232)) + 16|0);
    $234 = HEAP32[$233>>2]|0;
    $235 = ($234|0)==(0);
    $$22 = $235 ? 2 : 3;
    return ($$22|0);
   }
   $214 = ((($173)) + 12|0);
   $215 = HEAP32[$214>>2]|0;
   $216 = ((($175)) + 16|0);
   $217 = HEAP32[$216>>2]|0;
   _memcpy(($215|0),($217|0),($$21|0))|0;
   $218 = HEAP32[$214>>2]|0;
   $219 = (($218) + ($$21)|0);
   HEAP32[$214>>2] = $219;
   $220 = HEAP32[$216>>2]|0;
   $221 = (($220) + ($$21)|0);
   HEAP32[$216>>2] = $221;
   $222 = ((($173)) + 20|0);
   $223 = HEAP32[$222>>2]|0;
   $224 = (($223) + ($$21))|0;
   HEAP32[$222>>2] = $224;
   $225 = HEAP32[$210>>2]|0;
   $226 = (($225) - ($$21))|0;
   HEAP32[$210>>2] = $226;
   $227 = HEAP32[$$pre$phiZ2D>>2]|0;
   $228 = (($227) - ($$21))|0;
   HEAP32[$$pre$phiZ2D>>2] = $228;
   $229 = ($227|0)==($$21|0);
   if (!($229)) {
    $232 = HEAP32[$s>>2]|0;
    $233 = ((($232)) + 16|0);
    $234 = HEAP32[$233>>2]|0;
    $235 = ($234|0)==(0);
    $$22 = $235 ? 2 : 3;
    return ($$22|0);
   }
   $230 = ((($175)) + 8|0);
   $231 = HEAP32[$230>>2]|0;
   HEAP32[$216>>2] = $231;
   $232 = HEAP32[$s>>2]|0;
   $233 = ((($232)) + 16|0);
   $234 = HEAP32[$233>>2]|0;
   $235 = ($234|0)==(0);
   $$22 = $235 ? 2 : 3;
   return ($$22|0);
  }
  $236 = HEAP32[$5>>2]|0;
  $237 = HEAP32[$6>>2]|0;
  $238 = ($236|0)>($237|0);
  if ($238) {
   $239 = ($237|0)>(-1);
   if ($239) {
    $240 = HEAP32[$7>>2]|0;
    $241 = (($240) + ($237)|0);
    $243 = $241;
   } else {
    $243 = 0;
   }
   $242 = (($236) - ($237))|0;
   __tr_flush_block($s,$243,$242,0);
   $244 = HEAP32[$5>>2]|0;
   HEAP32[$6>>2] = $244;
   $245 = HEAP32[$s>>2]|0;
   $246 = ((($245)) + 28|0);
   $247 = HEAP32[$246>>2]|0;
   $248 = ((($247)) + 5820|0);
   $249 = HEAP32[$248>>2]|0;
   $250 = ($249|0)==(16);
   do {
    if ($250) {
     $251 = ((($247)) + 5816|0);
     $252 = HEAP16[$251>>1]|0;
     $253 = $252&255;
     $254 = ((($247)) + 20|0);
     $255 = HEAP32[$254>>2]|0;
     $256 = (($255) + 1)|0;
     HEAP32[$254>>2] = $256;
     $257 = ((($247)) + 8|0);
     $258 = HEAP32[$257>>2]|0;
     $259 = (($258) + ($255)|0);
     HEAP8[$259>>0] = $253;
     $260 = HEAP16[$251>>1]|0;
     $261 = ($260&65535) >>> 8;
     $262 = $261&255;
     $263 = HEAP32[$254>>2]|0;
     $264 = (($263) + 1)|0;
     HEAP32[$254>>2] = $264;
     $265 = HEAP32[$257>>2]|0;
     $266 = (($265) + ($263)|0);
     HEAP8[$266>>0] = $262;
     HEAP16[$251>>1] = 0;
     HEAP32[$248>>2] = 0;
     $$pre$phi13Z2D = $254;
    } else {
     $267 = ($249|0)>(7);
     if ($267) {
      $268 = ((($247)) + 5816|0);
      $269 = HEAP16[$268>>1]|0;
      $270 = $269&255;
      $271 = ((($247)) + 20|0);
      $272 = HEAP32[$271>>2]|0;
      $273 = (($272) + 1)|0;
      HEAP32[$271>>2] = $273;
      $274 = ((($247)) + 8|0);
      $275 = HEAP32[$274>>2]|0;
      $276 = (($275) + ($272)|0);
      HEAP8[$276>>0] = $270;
      $277 = HEAP16[$268>>1]|0;
      $278 = ($277&65535) >>> 8;
      HEAP16[$268>>1] = $278;
      $279 = HEAP32[$248>>2]|0;
      $280 = (($279) + -8)|0;
      HEAP32[$248>>2] = $280;
      $$pre$phi13Z2D = $271;
      break;
     } else {
      $$pre12 = ((($247)) + 20|0);
      $$pre$phi13Z2D = $$pre12;
      break;
     }
    }
   } while(0);
   $281 = HEAP32[$$pre$phi13Z2D>>2]|0;
   $282 = ((($245)) + 16|0);
   $283 = HEAP32[$282>>2]|0;
   $284 = ($281>>>0)>($283>>>0);
   $$23 = $284 ? $283 : $281;
   $285 = ($$23|0)==(0);
   if (!($285)) {
    $286 = ((($245)) + 12|0);
    $287 = HEAP32[$286>>2]|0;
    $288 = ((($247)) + 16|0);
    $289 = HEAP32[$288>>2]|0;
    _memcpy(($287|0),($289|0),($$23|0))|0;
    $290 = HEAP32[$286>>2]|0;
    $291 = (($290) + ($$23)|0);
    HEAP32[$286>>2] = $291;
    $292 = HEAP32[$288>>2]|0;
    $293 = (($292) + ($$23)|0);
    HEAP32[$288>>2] = $293;
    $294 = ((($245)) + 20|0);
    $295 = HEAP32[$294>>2]|0;
    $296 = (($295) + ($$23))|0;
    HEAP32[$294>>2] = $296;
    $297 = HEAP32[$282>>2]|0;
    $298 = (($297) - ($$23))|0;
    HEAP32[$282>>2] = $298;
    $299 = HEAP32[$$pre$phi13Z2D>>2]|0;
    $300 = (($299) - ($$23))|0;
    HEAP32[$$pre$phi13Z2D>>2] = $300;
    $301 = ($299|0)==($$23|0);
    if ($301) {
     $302 = ((($247)) + 8|0);
     $303 = HEAP32[$302>>2]|0;
     HEAP32[$288>>2] = $303;
    }
   }
   $304 = HEAP32[$s>>2]|0;
   $305 = ((($304)) + 16|0);
   $306 = HEAP32[$305>>2]|0;
   $307 = ($306|0)==(0);
   if ($307) {
    $$0 = 0;
    return ($$0|0);
   }
  }
  $$0 = 1;
  return ($$0|0);
 }
 else if ((label|0) == 55) {
  return ($$0|0);
 }
 return (0)|0;
}
function _fill_window($s) {
 $s = $s|0;
 var $$0$i = 0, $$4 = 0, $$5 = 0, $$pre = 0, $$pre1 = 0, $$pre2 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0;
 var $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0;
 var $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0;
 var $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $17 = 0;
 var $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0;
 var $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0;
 var $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0;
 var $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0;
 var $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $more$0 = 0, $more$0$ = 0, $n$0 = 0, $n$1 = 0, $p$0 = 0, $p$1 = 0, $str$0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($s)) + 44|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($s)) + 60|0);
 $3 = ((($s)) + 116|0);
 $4 = ((($s)) + 108|0);
 $5 = ((($s)) + 56|0);
 $6 = ((($s)) + 5812|0);
 $7 = ((($s)) + 72|0);
 $8 = ((($s)) + 88|0);
 $9 = ((($s)) + 84|0);
 $10 = ((($s)) + 68|0);
 $11 = ((($s)) + 52|0);
 $12 = ((($s)) + 64|0);
 $13 = ((($s)) + 112|0);
 $14 = ((($s)) + 92|0);
 $15 = ((($s)) + 76|0);
 $$pre = HEAP32[$3>>2]|0;
 $18 = $$pre;$22 = $1;
 while(1) {
  $16 = HEAP32[$2>>2]|0;
  $17 = (($16) - ($18))|0;
  $19 = HEAP32[$4>>2]|0;
  $20 = (($17) - ($19))|0;
  $21 = (($22) + -262)|0;
  $23 = (($1) + ($21))|0;
  $24 = ($19>>>0)<($23>>>0);
  if ($24) {
   $more$0 = $20;
  } else {
   $25 = HEAP32[$5>>2]|0;
   $26 = (($25) + ($1)|0);
   _memcpy(($25|0),($26|0),($1|0))|0;
   $27 = HEAP32[$13>>2]|0;
   $28 = (($27) - ($1))|0;
   HEAP32[$13>>2] = $28;
   $29 = HEAP32[$4>>2]|0;
   $30 = (($29) - ($1))|0;
   HEAP32[$4>>2] = $30;
   $31 = HEAP32[$14>>2]|0;
   $32 = (($31) - ($1))|0;
   HEAP32[$14>>2] = $32;
   $33 = HEAP32[$15>>2]|0;
   $34 = HEAP32[$10>>2]|0;
   $35 = (($34) + ($33<<1)|0);
   $n$0 = $33;$p$0 = $35;
   while(1) {
    $36 = ((($p$0)) + -2|0);
    $37 = HEAP16[$36>>1]|0;
    $38 = $37&65535;
    $39 = ($38>>>0)<($1>>>0);
    $40 = (($38) - ($1))|0;
    $41 = $40&65535;
    $42 = $39 ? 0 : $41;
    HEAP16[$36>>1] = $42;
    $43 = (($n$0) + -1)|0;
    $44 = ($43|0)==(0);
    if ($44) {
     break;
    } else {
     $n$0 = $43;$p$0 = $36;
    }
   }
   $45 = HEAP32[$12>>2]|0;
   $46 = (($45) + ($1<<1)|0);
   $n$1 = $1;$p$1 = $46;
   while(1) {
    $47 = ((($p$1)) + -2|0);
    $48 = HEAP16[$47>>1]|0;
    $49 = $48&65535;
    $50 = ($49>>>0)<($1>>>0);
    $51 = (($49) - ($1))|0;
    $52 = $51&65535;
    $53 = $50 ? 0 : $52;
    HEAP16[$47>>1] = $53;
    $54 = (($n$1) + -1)|0;
    $55 = ($54|0)==(0);
    if ($55) {
     break;
    } else {
     $n$1 = $54;$p$1 = $47;
    }
   }
   $56 = (($20) + ($1))|0;
   $more$0 = $56;
  }
  $57 = HEAP32[$s>>2]|0;
  $58 = ((($57)) + 4|0);
  $59 = HEAP32[$58>>2]|0;
  $60 = ($59|0)==(0);
  if ($60) {
   break;
  }
  $61 = HEAP32[$5>>2]|0;
  $62 = HEAP32[$4>>2]|0;
  $63 = (($61) + ($62)|0);
  $64 = HEAP32[$3>>2]|0;
  $65 = (($63) + ($64)|0);
  $66 = ($59>>>0)>($more$0>>>0);
  $more$0$ = $66 ? $more$0 : $59;
  $67 = ($more$0$|0)==(0);
  if ($67) {
   $$0$i = 0;$86 = $64;
  } else {
   $68 = (($59) - ($more$0$))|0;
   HEAP32[$58>>2] = $68;
   $69 = HEAP32[$57>>2]|0;
   _memcpy(($65|0),($69|0),($more$0$|0))|0;
   $70 = ((($57)) + 28|0);
   $71 = HEAP32[$70>>2]|0;
   $72 = ((($71)) + 24|0);
   $73 = HEAP32[$72>>2]|0;
   switch ($73|0) {
   case 1:  {
    $74 = ((($57)) + 48|0);
    $75 = HEAP32[$74>>2]|0;
    $76 = (_adler32($75,$65,$more$0$)|0);
    HEAP32[$74>>2] = $76;
    break;
   }
   case 2:  {
    $77 = ((($57)) + 48|0);
    $78 = HEAP32[$77>>2]|0;
    $79 = (_crc32($78,$65,$more$0$)|0);
    HEAP32[$77>>2] = $79;
    break;
   }
   default: {
   }
   }
   $80 = HEAP32[$57>>2]|0;
   $81 = (($80) + ($more$0$)|0);
   HEAP32[$57>>2] = $81;
   $82 = ((($57)) + 8|0);
   $83 = HEAP32[$82>>2]|0;
   $84 = (($83) + ($more$0$))|0;
   HEAP32[$82>>2] = $84;
   $$pre2 = HEAP32[$3>>2]|0;
   $$0$i = $more$0$;$86 = $$pre2;
  }
  $85 = (($86) + ($$0$i))|0;
  HEAP32[$3>>2] = $85;
  $87 = HEAP32[$6>>2]|0;
  $88 = (($85) + ($87))|0;
  $89 = ($88>>>0)>(2);
  L20: do {
   if ($89) {
    $90 = HEAP32[$4>>2]|0;
    $91 = (($90) - ($87))|0;
    $92 = HEAP32[$5>>2]|0;
    $93 = (($92) + ($91)|0);
    $94 = HEAP8[$93>>0]|0;
    $95 = $94&255;
    HEAP32[$7>>2] = $95;
    $96 = HEAP32[$8>>2]|0;
    $97 = $95 << $96;
    $98 = (($91) + 1)|0;
    $99 = (($92) + ($98)|0);
    $100 = HEAP8[$99>>0]|0;
    $101 = $100&255;
    $102 = $97 ^ $101;
    $103 = HEAP32[$9>>2]|0;
    $104 = $102 & $103;
    HEAP32[$7>>2] = $104;
    $106 = $87;$163 = $85;$str$0 = $91;
    while(1) {
     $105 = ($106|0)==(0);
     if ($105) {
      $136 = $163;
      break L20;
     }
     $107 = HEAP32[$7>>2]|0;
     $108 = HEAP32[$8>>2]|0;
     $109 = $107 << $108;
     $110 = (($str$0) + 2)|0;
     $111 = HEAP32[$5>>2]|0;
     $112 = (($111) + ($110)|0);
     $113 = HEAP8[$112>>0]|0;
     $114 = $113&255;
     $115 = $109 ^ $114;
     $116 = HEAP32[$9>>2]|0;
     $117 = $115 & $116;
     HEAP32[$7>>2] = $117;
     $118 = HEAP32[$10>>2]|0;
     $119 = (($118) + ($117<<1)|0);
     $120 = HEAP16[$119>>1]|0;
     $121 = HEAP32[$11>>2]|0;
     $122 = $str$0 & $121;
     $123 = HEAP32[$12>>2]|0;
     $124 = (($123) + ($122<<1)|0);
     HEAP16[$124>>1] = $120;
     $125 = $str$0&65535;
     $126 = HEAP32[$7>>2]|0;
     $127 = HEAP32[$10>>2]|0;
     $128 = (($127) + ($126<<1)|0);
     HEAP16[$128>>1] = $125;
     $129 = HEAP32[$6>>2]|0;
     $130 = (($129) + -1)|0;
     HEAP32[$6>>2] = $130;
     $131 = HEAP32[$3>>2]|0;
     $132 = (($131) + ($130))|0;
     $133 = ($132>>>0)<(3);
     if ($133) {
      $136 = $131;
      break L20;
     }
     $134 = (($str$0) + 1)|0;
     $106 = $130;$163 = $131;$str$0 = $134;
    }
   } else {
    $136 = $85;
   }
  } while(0);
  $135 = ($136>>>0)<(262);
  if (!($135)) {
   break;
  }
  $137 = HEAP32[$s>>2]|0;
  $138 = ((($137)) + 4|0);
  $139 = HEAP32[$138>>2]|0;
  $140 = ($139|0)==(0);
  if ($140) {
   break;
  }
  $$pre1 = HEAP32[$0>>2]|0;
  $18 = $136;$22 = $$pre1;
 }
 $141 = ((($s)) + 5824|0);
 $142 = HEAP32[$141>>2]|0;
 $143 = HEAP32[$2>>2]|0;
 $144 = ($143>>>0)>($142>>>0);
 if (!($144)) {
  return;
 }
 $145 = HEAP32[$4>>2]|0;
 $146 = HEAP32[$3>>2]|0;
 $147 = (($145) + ($146))|0;
 $148 = ($142>>>0)<($147>>>0);
 if ($148) {
  $149 = (($143) - ($147))|0;
  $150 = ($149>>>0)>(258);
  $$4 = $150 ? 258 : $149;
  $151 = HEAP32[$5>>2]|0;
  $152 = (($151) + ($147)|0);
  _memset(($152|0),0,($$4|0))|0;
  $153 = (($147) + ($$4))|0;
  HEAP32[$141>>2] = $153;
  return;
 }
 $154 = (($147) + 258)|0;
 $155 = ($154>>>0)>($142>>>0);
 if (!($155)) {
  return;
 }
 $156 = (($154) - ($142))|0;
 $157 = (($143) - ($142))|0;
 $158 = ($156>>>0)>($157>>>0);
 $$5 = $158 ? $157 : $156;
 $159 = HEAP32[$5>>2]|0;
 $160 = (($159) + ($142)|0);
 _memset(($160|0),0,($$5|0))|0;
 $161 = HEAP32[$141>>2]|0;
 $162 = (($161) + ($$5))|0;
 HEAP32[$141>>2] = $162;
 return;
}
function _deflate_fast($s,$flush) {
 $s = $s|0;
 $flush = $flush|0;
 var $$ = 0, $$0 = 0, $$12 = 0, $$13 = 0, $$14 = 0, $$15 = 0, $$not = 0, $$not11 = 0, $$pn = 0, $$pr = 0, $$pre = 0, $$pre$phi10Z2D = 0, $$pre$phi8Z2D = 0, $$pre$phiZ2D = 0, $$pre7 = 0, $$pre9 = 0, $$sink = 0, $$sink$in = 0, $0 = 0, $1 = 0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0;
 var $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0;
 var $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0;
 var $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0;
 var $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0;
 var $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0;
 var $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0;
 var $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0;
 var $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0;
 var $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0;
 var $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $39 = 0;
 var $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0;
 var $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0;
 var $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0;
 var $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $bflush$0 = 0, $brmerge = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($s)) + 116|0);
 $1 = ((($s)) + 72|0);
 $2 = ((($s)) + 88|0);
 $3 = ((($s)) + 108|0);
 $4 = ((($s)) + 56|0);
 $5 = ((($s)) + 84|0);
 $6 = ((($s)) + 68|0);
 $7 = ((($s)) + 52|0);
 $8 = ((($s)) + 64|0);
 $9 = ((($s)) + 44|0);
 $10 = ((($s)) + 96|0);
 $11 = ((($s)) + 112|0);
 $12 = ((($s)) + 5792|0);
 $13 = ((($s)) + 5796|0);
 $14 = ((($s)) + 5784|0);
 $15 = ((($s)) + 5788|0);
 $16 = ((($s)) + 128|0);
 $17 = ((($s)) + 92|0);
 while(1) {
  $18 = HEAP32[$0>>2]|0;
  $19 = ($18>>>0)<(262);
  if ($19) {
   _fill_window($s);
   $20 = HEAP32[$0>>2]|0;
   $$not = ($20>>>0)>(261);
   $$not11 = ($flush|0)!=(0);
   $brmerge = $$not | $$not11;
   if (!($brmerge)) {
    $$0 = 0;
    label = 54;
    break;
   }
   $21 = ($20|0)==(0);
   if ($21) {
    label = 29;
    break;
   } else {
    $23 = $20;
   }
   $22 = ($23>>>0)>(2);
   if ($22) {
    label = 6;
   } else {
    label = 9;
   }
  } else {
   label = 6;
  }
  if ((label|0) == 6) {
   label = 0;
   $24 = HEAP32[$1>>2]|0;
   $25 = HEAP32[$2>>2]|0;
   $26 = $24 << $25;
   $27 = HEAP32[$3>>2]|0;
   $28 = (($27) + 2)|0;
   $29 = HEAP32[$4>>2]|0;
   $30 = (($29) + ($28)|0);
   $31 = HEAP8[$30>>0]|0;
   $32 = $31&255;
   $33 = $26 ^ $32;
   $34 = HEAP32[$5>>2]|0;
   $35 = $33 & $34;
   HEAP32[$1>>2] = $35;
   $36 = HEAP32[$6>>2]|0;
   $37 = (($36) + ($35<<1)|0);
   $38 = HEAP16[$37>>1]|0;
   $39 = HEAP32[$7>>2]|0;
   $40 = $27 & $39;
   $41 = HEAP32[$8>>2]|0;
   $42 = (($41) + ($40<<1)|0);
   HEAP16[$42>>1] = $38;
   $43 = $38&65535;
   $44 = HEAP32[$3>>2]|0;
   $45 = $44&65535;
   $46 = HEAP32[$1>>2]|0;
   $47 = HEAP32[$6>>2]|0;
   $48 = (($47) + ($46<<1)|0);
   HEAP16[$48>>1] = $45;
   $49 = ($38<<16>>16)==(0);
   if ($49) {
    label = 9;
   } else {
    $50 = HEAP32[$3>>2]|0;
    $51 = (($50) - ($43))|0;
    $52 = HEAP32[$9>>2]|0;
    $53 = (($52) + -262)|0;
    $54 = ($51>>>0)>($53>>>0);
    if ($54) {
     label = 9;
    } else {
     $55 = (_longest_match($s,$43)|0);
     HEAP32[$10>>2] = $55;
     $57 = $55;
    }
   }
  }
  if ((label|0) == 9) {
   label = 0;
   $$pr = HEAP32[$10>>2]|0;
   $57 = $$pr;
  }
  $56 = ($57>>>0)>(2);
  do {
   if ($56) {
    $58 = (($57) + 253)|0;
    $59 = $58&255;
    $60 = HEAP32[$3>>2]|0;
    $61 = HEAP32[$11>>2]|0;
    $62 = (($60) - ($61))|0;
    $63 = $62&65535;
    $64 = HEAP32[$12>>2]|0;
    $65 = HEAP32[$13>>2]|0;
    $66 = (($65) + ($64<<1)|0);
    HEAP16[$66>>1] = $63;
    $67 = HEAP32[$12>>2]|0;
    $68 = (($67) + 1)|0;
    HEAP32[$12>>2] = $68;
    $69 = HEAP32[$14>>2]|0;
    $70 = (($69) + ($67)|0);
    HEAP8[$70>>0] = $59;
    $71 = (($63) + -1)<<16>>16;
    $72 = $58 & 255;
    $73 = (14341 + ($72)|0);
    $74 = HEAP8[$73>>0]|0;
    $75 = $74&255;
    $76 = $75 | 256;
    $77 = (($76) + 1)|0;
    $78 = (((($s)) + 148|0) + ($77<<2)|0);
    $79 = HEAP16[$78>>1]|0;
    $80 = (($79) + 1)<<16>>16;
    HEAP16[$78>>1] = $80;
    $81 = ($71&65535)<(256);
    $82 = $71&65535;
    $83 = $82 >>> 7;
    $84 = (($83) + 256)|0;
    $$pn = $81 ? $82 : $84;
    $$sink$in = (13829 + ($$pn)|0);
    $$sink = HEAP8[$$sink$in>>0]|0;
    $85 = $$sink&255;
    $86 = (((($s)) + 2440|0) + ($85<<2)|0);
    $87 = HEAP16[$86>>1]|0;
    $88 = (($87) + 1)<<16>>16;
    HEAP16[$86>>1] = $88;
    $89 = HEAP32[$12>>2]|0;
    $90 = HEAP32[$15>>2]|0;
    $91 = (($90) + -1)|0;
    $92 = ($89|0)==($91|0);
    $93 = $92&1;
    $94 = HEAP32[$10>>2]|0;
    $95 = HEAP32[$0>>2]|0;
    $96 = (($95) - ($94))|0;
    HEAP32[$0>>2] = $96;
    $97 = HEAP32[$16>>2]|0;
    $98 = ($94>>>0)<=($97>>>0);
    $99 = ($96>>>0)>(2);
    $or$cond = $98 & $99;
    if (!($or$cond)) {
     $131 = HEAP32[$3>>2]|0;
     $132 = (($131) + ($94))|0;
     HEAP32[$3>>2] = $132;
     HEAP32[$10>>2] = 0;
     $133 = HEAP32[$4>>2]|0;
     $134 = (($133) + ($132)|0);
     $135 = HEAP8[$134>>0]|0;
     $136 = $135&255;
     HEAP32[$1>>2] = $136;
     $137 = HEAP32[$2>>2]|0;
     $138 = $136 << $137;
     $139 = (($132) + 1)|0;
     $140 = (($133) + ($139)|0);
     $141 = HEAP8[$140>>0]|0;
     $142 = $141&255;
     $143 = $138 ^ $142;
     $144 = HEAP32[$5>>2]|0;
     $145 = $143 & $144;
     HEAP32[$1>>2] = $145;
     $176 = $132;$bflush$0 = $93;
     break;
    }
    $100 = (($94) + -1)|0;
    HEAP32[$10>>2] = $100;
    while(1) {
     $101 = HEAP32[$3>>2]|0;
     $102 = (($101) + 1)|0;
     HEAP32[$3>>2] = $102;
     $103 = HEAP32[$1>>2]|0;
     $104 = HEAP32[$2>>2]|0;
     $105 = $103 << $104;
     $106 = (($101) + 3)|0;
     $107 = HEAP32[$4>>2]|0;
     $108 = (($107) + ($106)|0);
     $109 = HEAP8[$108>>0]|0;
     $110 = $109&255;
     $111 = $105 ^ $110;
     $112 = HEAP32[$5>>2]|0;
     $113 = $111 & $112;
     HEAP32[$1>>2] = $113;
     $114 = HEAP32[$6>>2]|0;
     $115 = (($114) + ($113<<1)|0);
     $116 = HEAP16[$115>>1]|0;
     $117 = HEAP32[$7>>2]|0;
     $118 = $102 & $117;
     $119 = HEAP32[$8>>2]|0;
     $120 = (($119) + ($118<<1)|0);
     HEAP16[$120>>1] = $116;
     $121 = HEAP32[$3>>2]|0;
     $122 = $121&65535;
     $123 = HEAP32[$1>>2]|0;
     $124 = HEAP32[$6>>2]|0;
     $125 = (($124) + ($123<<1)|0);
     HEAP16[$125>>1] = $122;
     $126 = HEAP32[$10>>2]|0;
     $127 = (($126) + -1)|0;
     HEAP32[$10>>2] = $127;
     $128 = ($127|0)==(0);
     if ($128) {
      break;
     }
    }
    $129 = HEAP32[$3>>2]|0;
    $130 = (($129) + 1)|0;
    HEAP32[$3>>2] = $130;
    $176 = $130;$bflush$0 = $93;
   } else {
    $146 = HEAP32[$3>>2]|0;
    $147 = HEAP32[$4>>2]|0;
    $148 = (($147) + ($146)|0);
    $149 = HEAP8[$148>>0]|0;
    $150 = HEAP32[$12>>2]|0;
    $151 = HEAP32[$13>>2]|0;
    $152 = (($151) + ($150<<1)|0);
    HEAP16[$152>>1] = 0;
    $153 = HEAP32[$12>>2]|0;
    $154 = (($153) + 1)|0;
    HEAP32[$12>>2] = $154;
    $155 = HEAP32[$14>>2]|0;
    $156 = (($155) + ($153)|0);
    HEAP8[$156>>0] = $149;
    $157 = $149&255;
    $158 = (((($s)) + 148|0) + ($157<<2)|0);
    $159 = HEAP16[$158>>1]|0;
    $160 = (($159) + 1)<<16>>16;
    HEAP16[$158>>1] = $160;
    $161 = HEAP32[$12>>2]|0;
    $162 = HEAP32[$15>>2]|0;
    $163 = (($162) + -1)|0;
    $164 = ($161|0)==($163|0);
    $165 = $164&1;
    $166 = HEAP32[$0>>2]|0;
    $167 = (($166) + -1)|0;
    HEAP32[$0>>2] = $167;
    $168 = HEAP32[$3>>2]|0;
    $169 = (($168) + 1)|0;
    HEAP32[$3>>2] = $169;
    $176 = $169;$bflush$0 = $165;
   }
  } while(0);
  $170 = ($bflush$0|0)==(0);
  if ($170) {
   continue;
  }
  $171 = HEAP32[$17>>2]|0;
  $172 = ($171|0)>(-1);
  if ($172) {
   $173 = HEAP32[$4>>2]|0;
   $174 = (($173) + ($171)|0);
   $177 = $174;
  } else {
   $177 = 0;
  }
  $175 = (($176) - ($171))|0;
  __tr_flush_block($s,$177,$175,0);
  $178 = HEAP32[$3>>2]|0;
  HEAP32[$17>>2] = $178;
  $179 = HEAP32[$s>>2]|0;
  $180 = ((($179)) + 28|0);
  $181 = HEAP32[$180>>2]|0;
  $182 = ((($181)) + 5820|0);
  $183 = HEAP32[$182>>2]|0;
  $184 = ($183|0)==(16);
  do {
   if ($184) {
    $185 = ((($181)) + 5816|0);
    $186 = HEAP16[$185>>1]|0;
    $187 = $186&255;
    $188 = ((($181)) + 20|0);
    $189 = HEAP32[$188>>2]|0;
    $190 = (($189) + 1)|0;
    HEAP32[$188>>2] = $190;
    $191 = ((($181)) + 8|0);
    $192 = HEAP32[$191>>2]|0;
    $193 = (($192) + ($189)|0);
    HEAP8[$193>>0] = $187;
    $194 = HEAP16[$185>>1]|0;
    $195 = ($194&65535) >>> 8;
    $196 = $195&255;
    $197 = HEAP32[$188>>2]|0;
    $198 = (($197) + 1)|0;
    HEAP32[$188>>2] = $198;
    $199 = HEAP32[$191>>2]|0;
    $200 = (($199) + ($197)|0);
    HEAP8[$200>>0] = $196;
    HEAP16[$185>>1] = 0;
    HEAP32[$182>>2] = 0;
    $$pre$phi10Z2D = $188;
   } else {
    $201 = ($183|0)>(7);
    if ($201) {
     $202 = ((($181)) + 5816|0);
     $203 = HEAP16[$202>>1]|0;
     $204 = $203&255;
     $205 = ((($181)) + 20|0);
     $206 = HEAP32[$205>>2]|0;
     $207 = (($206) + 1)|0;
     HEAP32[$205>>2] = $207;
     $208 = ((($181)) + 8|0);
     $209 = HEAP32[$208>>2]|0;
     $210 = (($209) + ($206)|0);
     HEAP8[$210>>0] = $204;
     $211 = HEAP16[$202>>1]|0;
     $212 = ($211&65535) >>> 8;
     HEAP16[$202>>1] = $212;
     $213 = HEAP32[$182>>2]|0;
     $214 = (($213) + -8)|0;
     HEAP32[$182>>2] = $214;
     $$pre$phi10Z2D = $205;
     break;
    } else {
     $$pre9 = ((($181)) + 20|0);
     $$pre$phi10Z2D = $$pre9;
     break;
    }
   }
  } while(0);
  $215 = HEAP32[$$pre$phi10Z2D>>2]|0;
  $216 = ((($179)) + 16|0);
  $217 = HEAP32[$216>>2]|0;
  $218 = ($215>>>0)>($217>>>0);
  $$ = $218 ? $217 : $215;
  $219 = ($$|0)==(0);
  if (!($219)) {
   $220 = ((($179)) + 12|0);
   $221 = HEAP32[$220>>2]|0;
   $222 = ((($181)) + 16|0);
   $223 = HEAP32[$222>>2]|0;
   _memcpy(($221|0),($223|0),($$|0))|0;
   $224 = HEAP32[$220>>2]|0;
   $225 = (($224) + ($$)|0);
   HEAP32[$220>>2] = $225;
   $226 = HEAP32[$222>>2]|0;
   $227 = (($226) + ($$)|0);
   HEAP32[$222>>2] = $227;
   $228 = ((($179)) + 20|0);
   $229 = HEAP32[$228>>2]|0;
   $230 = (($229) + ($$))|0;
   HEAP32[$228>>2] = $230;
   $231 = HEAP32[$216>>2]|0;
   $232 = (($231) - ($$))|0;
   HEAP32[$216>>2] = $232;
   $233 = HEAP32[$$pre$phi10Z2D>>2]|0;
   $234 = (($233) - ($$))|0;
   HEAP32[$$pre$phi10Z2D>>2] = $234;
   $235 = ($233|0)==($$|0);
   if ($235) {
    $236 = ((($181)) + 8|0);
    $237 = HEAP32[$236>>2]|0;
    HEAP32[$222>>2] = $237;
   }
  }
  $238 = HEAP32[$s>>2]|0;
  $239 = ((($238)) + 16|0);
  $240 = HEAP32[$239>>2]|0;
  $241 = ($240|0)==(0);
  if ($241) {
   $$0 = 0;
   label = 54;
   break;
  }
 }
 if ((label|0) == 29) {
  $242 = HEAP32[$3>>2]|0;
  $243 = ($242>>>0)<(2);
  $$12 = $243 ? $242 : 2;
  $244 = ((($s)) + 5812|0);
  HEAP32[$244>>2] = $$12;
  $245 = ($flush|0)==(4);
  if ($245) {
   $246 = HEAP32[$17>>2]|0;
   $247 = ($246|0)>(-1);
   if ($247) {
    $248 = HEAP32[$4>>2]|0;
    $249 = (($248) + ($246)|0);
    $251 = $249;
   } else {
    $251 = 0;
   }
   $250 = (($242) - ($246))|0;
   __tr_flush_block($s,$251,$250,1);
   $252 = HEAP32[$3>>2]|0;
   HEAP32[$17>>2] = $252;
   $253 = HEAP32[$s>>2]|0;
   $254 = ((($253)) + 28|0);
   $255 = HEAP32[$254>>2]|0;
   $256 = ((($255)) + 5820|0);
   $257 = HEAP32[$256>>2]|0;
   $258 = ($257|0)==(16);
   do {
    if ($258) {
     $259 = ((($255)) + 5816|0);
     $260 = HEAP16[$259>>1]|0;
     $261 = $260&255;
     $262 = ((($255)) + 20|0);
     $263 = HEAP32[$262>>2]|0;
     $264 = (($263) + 1)|0;
     HEAP32[$262>>2] = $264;
     $265 = ((($255)) + 8|0);
     $266 = HEAP32[$265>>2]|0;
     $267 = (($266) + ($263)|0);
     HEAP8[$267>>0] = $261;
     $268 = HEAP16[$259>>1]|0;
     $269 = ($268&65535) >>> 8;
     $270 = $269&255;
     $271 = HEAP32[$262>>2]|0;
     $272 = (($271) + 1)|0;
     HEAP32[$262>>2] = $272;
     $273 = HEAP32[$265>>2]|0;
     $274 = (($273) + ($271)|0);
     HEAP8[$274>>0] = $270;
     HEAP16[$259>>1] = 0;
     HEAP32[$256>>2] = 0;
     $$pre$phiZ2D = $262;
    } else {
     $275 = ($257|0)>(7);
     if ($275) {
      $276 = ((($255)) + 5816|0);
      $277 = HEAP16[$276>>1]|0;
      $278 = $277&255;
      $279 = ((($255)) + 20|0);
      $280 = HEAP32[$279>>2]|0;
      $281 = (($280) + 1)|0;
      HEAP32[$279>>2] = $281;
      $282 = ((($255)) + 8|0);
      $283 = HEAP32[$282>>2]|0;
      $284 = (($283) + ($280)|0);
      HEAP8[$284>>0] = $278;
      $285 = HEAP16[$276>>1]|0;
      $286 = ($285&65535) >>> 8;
      HEAP16[$276>>1] = $286;
      $287 = HEAP32[$256>>2]|0;
      $288 = (($287) + -8)|0;
      HEAP32[$256>>2] = $288;
      $$pre$phiZ2D = $279;
      break;
     } else {
      $$pre = ((($255)) + 20|0);
      $$pre$phiZ2D = $$pre;
      break;
     }
    }
   } while(0);
   $289 = HEAP32[$$pre$phiZ2D>>2]|0;
   $290 = ((($253)) + 16|0);
   $291 = HEAP32[$290>>2]|0;
   $292 = ($289>>>0)>($291>>>0);
   $$13 = $292 ? $291 : $289;
   $293 = ($$13|0)==(0);
   if ($293) {
    $312 = HEAP32[$s>>2]|0;
    $313 = ((($312)) + 16|0);
    $314 = HEAP32[$313>>2]|0;
    $315 = ($314|0)==(0);
    $$14 = $315 ? 2 : 3;
    return ($$14|0);
   }
   $294 = ((($253)) + 12|0);
   $295 = HEAP32[$294>>2]|0;
   $296 = ((($255)) + 16|0);
   $297 = HEAP32[$296>>2]|0;
   _memcpy(($295|0),($297|0),($$13|0))|0;
   $298 = HEAP32[$294>>2]|0;
   $299 = (($298) + ($$13)|0);
   HEAP32[$294>>2] = $299;
   $300 = HEAP32[$296>>2]|0;
   $301 = (($300) + ($$13)|0);
   HEAP32[$296>>2] = $301;
   $302 = ((($253)) + 20|0);
   $303 = HEAP32[$302>>2]|0;
   $304 = (($303) + ($$13))|0;
   HEAP32[$302>>2] = $304;
   $305 = HEAP32[$290>>2]|0;
   $306 = (($305) - ($$13))|0;
   HEAP32[$290>>2] = $306;
   $307 = HEAP32[$$pre$phiZ2D>>2]|0;
   $308 = (($307) - ($$13))|0;
   HEAP32[$$pre$phiZ2D>>2] = $308;
   $309 = ($307|0)==($$13|0);
   if (!($309)) {
    $312 = HEAP32[$s>>2]|0;
    $313 = ((($312)) + 16|0);
    $314 = HEAP32[$313>>2]|0;
    $315 = ($314|0)==(0);
    $$14 = $315 ? 2 : 3;
    return ($$14|0);
   }
   $310 = ((($255)) + 8|0);
   $311 = HEAP32[$310>>2]|0;
   HEAP32[$296>>2] = $311;
   $312 = HEAP32[$s>>2]|0;
   $313 = ((($312)) + 16|0);
   $314 = HEAP32[$313>>2]|0;
   $315 = ($314|0)==(0);
   $$14 = $315 ? 2 : 3;
   return ($$14|0);
  }
  $316 = HEAP32[$12>>2]|0;
  $317 = ($316|0)==(0);
  if (!($317)) {
   $318 = HEAP32[$17>>2]|0;
   $319 = ($318|0)>(-1);
   if ($319) {
    $320 = HEAP32[$4>>2]|0;
    $321 = (($320) + ($318)|0);
    $323 = $321;
   } else {
    $323 = 0;
   }
   $322 = (($242) - ($318))|0;
   __tr_flush_block($s,$323,$322,0);
   $324 = HEAP32[$3>>2]|0;
   HEAP32[$17>>2] = $324;
   $325 = HEAP32[$s>>2]|0;
   $326 = ((($325)) + 28|0);
   $327 = HEAP32[$326>>2]|0;
   $328 = ((($327)) + 5820|0);
   $329 = HEAP32[$328>>2]|0;
   $330 = ($329|0)==(16);
   do {
    if ($330) {
     $331 = ((($327)) + 5816|0);
     $332 = HEAP16[$331>>1]|0;
     $333 = $332&255;
     $334 = ((($327)) + 20|0);
     $335 = HEAP32[$334>>2]|0;
     $336 = (($335) + 1)|0;
     HEAP32[$334>>2] = $336;
     $337 = ((($327)) + 8|0);
     $338 = HEAP32[$337>>2]|0;
     $339 = (($338) + ($335)|0);
     HEAP8[$339>>0] = $333;
     $340 = HEAP16[$331>>1]|0;
     $341 = ($340&65535) >>> 8;
     $342 = $341&255;
     $343 = HEAP32[$334>>2]|0;
     $344 = (($343) + 1)|0;
     HEAP32[$334>>2] = $344;
     $345 = HEAP32[$337>>2]|0;
     $346 = (($345) + ($343)|0);
     HEAP8[$346>>0] = $342;
     HEAP16[$331>>1] = 0;
     HEAP32[$328>>2] = 0;
     $$pre$phi8Z2D = $334;
    } else {
     $347 = ($329|0)>(7);
     if ($347) {
      $348 = ((($327)) + 5816|0);
      $349 = HEAP16[$348>>1]|0;
      $350 = $349&255;
      $351 = ((($327)) + 20|0);
      $352 = HEAP32[$351>>2]|0;
      $353 = (($352) + 1)|0;
      HEAP32[$351>>2] = $353;
      $354 = ((($327)) + 8|0);
      $355 = HEAP32[$354>>2]|0;
      $356 = (($355) + ($352)|0);
      HEAP8[$356>>0] = $350;
      $357 = HEAP16[$348>>1]|0;
      $358 = ($357&65535) >>> 8;
      HEAP16[$348>>1] = $358;
      $359 = HEAP32[$328>>2]|0;
      $360 = (($359) + -8)|0;
      HEAP32[$328>>2] = $360;
      $$pre$phi8Z2D = $351;
      break;
     } else {
      $$pre7 = ((($327)) + 20|0);
      $$pre$phi8Z2D = $$pre7;
      break;
     }
    }
   } while(0);
   $361 = HEAP32[$$pre$phi8Z2D>>2]|0;
   $362 = ((($325)) + 16|0);
   $363 = HEAP32[$362>>2]|0;
   $364 = ($361>>>0)>($363>>>0);
   $$15 = $364 ? $363 : $361;
   $365 = ($$15|0)==(0);
   if (!($365)) {
    $366 = ((($325)) + 12|0);
    $367 = HEAP32[$366>>2]|0;
    $368 = ((($327)) + 16|0);
    $369 = HEAP32[$368>>2]|0;
    _memcpy(($367|0),($369|0),($$15|0))|0;
    $370 = HEAP32[$366>>2]|0;
    $371 = (($370) + ($$15)|0);
    HEAP32[$366>>2] = $371;
    $372 = HEAP32[$368>>2]|0;
    $373 = (($372) + ($$15)|0);
    HEAP32[$368>>2] = $373;
    $374 = ((($325)) + 20|0);
    $375 = HEAP32[$374>>2]|0;
    $376 = (($375) + ($$15))|0;
    HEAP32[$374>>2] = $376;
    $377 = HEAP32[$362>>2]|0;
    $378 = (($377) - ($$15))|0;
    HEAP32[$362>>2] = $378;
    $379 = HEAP32[$$pre$phi8Z2D>>2]|0;
    $380 = (($379) - ($$15))|0;
    HEAP32[$$pre$phi8Z2D>>2] = $380;
    $381 = ($379|0)==($$15|0);
    if ($381) {
     $382 = ((($327)) + 8|0);
     $383 = HEAP32[$382>>2]|0;
     HEAP32[$368>>2] = $383;
    }
   }
   $384 = HEAP32[$s>>2]|0;
   $385 = ((($384)) + 16|0);
   $386 = HEAP32[$385>>2]|0;
   $387 = ($386|0)==(0);
   if ($387) {
    $$0 = 0;
    return ($$0|0);
   }
  }
  $$0 = 1;
  return ($$0|0);
 }
 else if ((label|0) == 54) {
  return ($$0|0);
 }
 return (0)|0;
}
function _longest_match($s,$cur_match) {
 $s = $s|0;
 $cur_match = $cur_match|0;
 var $$ = 0, $$01 = 0, $$4 = 0, $$best_len$3 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0;
 var $112 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0;
 var $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $best_len$0 = 0, $best_len$2 = 0, $best_len$3 = 0;
 var $chain_length$0 = 0, $chain_length$1 = 0, $match$0 = 0, $or$cond = 0, $scan$0 = 0, $scan$1 = 0, $scan$22 = 0, $scan$3 = 0, $scan_end$0 = 0, $scan_end$2 = 0, $scan_end1$0 = 0, $scan_end1$2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($s)) + 124|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($s)) + 56|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ((($s)) + 108|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + ($5)|0);
 $7 = ((($s)) + 120|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($s)) + 144|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ((($s)) + 44|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = (($12) + -262)|0;
 $14 = ($5>>>0)>($13>>>0);
 $15 = (($5) - ($13))|0;
 $$ = $14 ? $15 : 0;
 $16 = ((($s)) + 64|0);
 $17 = HEAP32[$16>>2]|0;
 $18 = ((($s)) + 52|0);
 $19 = HEAP32[$18>>2]|0;
 $20 = ((($6)) + 258|0);
 $21 = (($8) + -1)|0;
 $22 = (($6) + ($21)|0);
 $23 = HEAP8[$22>>0]|0;
 $24 = (($6) + ($8)|0);
 $25 = HEAP8[$24>>0]|0;
 $26 = ((($s)) + 140|0);
 $27 = HEAP32[$26>>2]|0;
 $28 = ($8>>>0)<($27>>>0);
 $29 = $1 >>> 2;
 $chain_length$0 = $28 ? $1 : $29;
 $30 = ((($s)) + 116|0);
 $31 = HEAP32[$30>>2]|0;
 $32 = ($10>>>0)>($31>>>0);
 $$4 = $32 ? $31 : $10;
 $33 = ((($s)) + 112|0);
 $34 = $20;
 $35 = ((($20)) + -258|0);
 $$01 = $cur_match;$best_len$0 = $8;$chain_length$1 = $chain_length$0;$scan$0 = $6;$scan_end$0 = $25;$scan_end1$0 = $23;
 while(1) {
  $36 = (($3) + ($$01)|0);
  $37 = (($36) + ($best_len$0)|0);
  $38 = HEAP8[$37>>0]|0;
  $39 = ($38<<24>>24)==($scan_end$0<<24>>24);
  if ($39) {
   $40 = (($best_len$0) + -1)|0;
   $41 = (($36) + ($40)|0);
   $42 = HEAP8[$41>>0]|0;
   $43 = ($42<<24>>24)==($scan_end1$0<<24>>24);
   if ($43) {
    $44 = HEAP8[$36>>0]|0;
    $45 = HEAP8[$scan$0>>0]|0;
    $46 = ($44<<24>>24)==($45<<24>>24);
    if ($46) {
     $47 = ((($36)) + 1|0);
     $48 = HEAP8[$47>>0]|0;
     $49 = ((($scan$0)) + 1|0);
     $50 = HEAP8[$49>>0]|0;
     $51 = ($48<<24>>24)==($50<<24>>24);
     if ($51) {
      $52 = ((($scan$0)) + 2|0);
      $53 = ((($47)) + 1|0);
      $match$0 = $53;$scan$1 = $52;
      while(1) {
       $54 = ((($scan$1)) + 1|0);
       $55 = HEAP8[$54>>0]|0;
       $56 = ((($match$0)) + 1|0);
       $57 = HEAP8[$56>>0]|0;
       $58 = ($55<<24>>24)==($57<<24>>24);
       if (!($58)) {
        $scan$22 = $54;
        break;
       }
       $59 = ((($scan$1)) + 2|0);
       $60 = HEAP8[$59>>0]|0;
       $61 = ((($match$0)) + 2|0);
       $62 = HEAP8[$61>>0]|0;
       $63 = ($60<<24>>24)==($62<<24>>24);
       if (!($63)) {
        $scan$22 = $59;
        break;
       }
       $64 = ((($scan$1)) + 3|0);
       $65 = HEAP8[$64>>0]|0;
       $66 = ((($match$0)) + 3|0);
       $67 = HEAP8[$66>>0]|0;
       $68 = ($65<<24>>24)==($67<<24>>24);
       if (!($68)) {
        $scan$22 = $64;
        break;
       }
       $69 = ((($scan$1)) + 4|0);
       $70 = HEAP8[$69>>0]|0;
       $71 = ((($match$0)) + 4|0);
       $72 = HEAP8[$71>>0]|0;
       $73 = ($70<<24>>24)==($72<<24>>24);
       if (!($73)) {
        $scan$22 = $69;
        break;
       }
       $74 = ((($scan$1)) + 5|0);
       $75 = HEAP8[$74>>0]|0;
       $76 = ((($match$0)) + 5|0);
       $77 = HEAP8[$76>>0]|0;
       $78 = ($75<<24>>24)==($77<<24>>24);
       if (!($78)) {
        $scan$22 = $74;
        break;
       }
       $79 = ((($scan$1)) + 6|0);
       $80 = HEAP8[$79>>0]|0;
       $81 = ((($match$0)) + 6|0);
       $82 = HEAP8[$81>>0]|0;
       $83 = ($80<<24>>24)==($82<<24>>24);
       if (!($83)) {
        $scan$22 = $79;
        break;
       }
       $84 = ((($scan$1)) + 7|0);
       $85 = HEAP8[$84>>0]|0;
       $86 = ((($match$0)) + 7|0);
       $87 = HEAP8[$86>>0]|0;
       $88 = ($85<<24>>24)==($87<<24>>24);
       if (!($88)) {
        $scan$22 = $84;
        break;
       }
       $89 = ((($scan$1)) + 8|0);
       $90 = HEAP8[$89>>0]|0;
       $91 = ((($match$0)) + 8|0);
       $92 = HEAP8[$91>>0]|0;
       $93 = ($90<<24>>24)==($92<<24>>24);
       $94 = ($89>>>0)<($20>>>0);
       $or$cond = $93 & $94;
       if ($or$cond) {
        $match$0 = $91;$scan$1 = $89;
       } else {
        $scan$22 = $89;
        break;
       }
      }
      $95 = $scan$22;
      $96 = (($95) - ($34))|0;
      $97 = (($96) + 258)|0;
      $98 = ($97|0)>($best_len$0|0);
      if ($98) {
       HEAP32[$33>>2] = $$01;
       $99 = ($97|0)<($$4|0);
       if (!($99)) {
        $best_len$3 = $97;
        label = 20;
        break;
       }
       $100 = (($96) + 257)|0;
       $101 = (($35) + ($100)|0);
       $102 = HEAP8[$101>>0]|0;
       $103 = (($35) + ($97)|0);
       $104 = HEAP8[$103>>0]|0;
       $best_len$2 = $97;$scan$3 = $35;$scan_end$2 = $104;$scan_end1$2 = $102;
      } else {
       $best_len$2 = $best_len$0;$scan$3 = $35;$scan_end$2 = $scan_end$0;$scan_end1$2 = $scan_end1$0;
      }
     } else {
      $best_len$2 = $best_len$0;$scan$3 = $scan$0;$scan_end$2 = $scan_end$0;$scan_end1$2 = $scan_end1$0;
     }
    } else {
     $best_len$2 = $best_len$0;$scan$3 = $scan$0;$scan_end$2 = $scan_end$0;$scan_end1$2 = $scan_end1$0;
    }
   } else {
    $best_len$2 = $best_len$0;$scan$3 = $scan$0;$scan_end$2 = $scan_end$0;$scan_end1$2 = $scan_end1$0;
   }
  } else {
   $best_len$2 = $best_len$0;$scan$3 = $scan$0;$scan_end$2 = $scan_end$0;$scan_end1$2 = $scan_end1$0;
  }
  $105 = $$01 & $19;
  $106 = (($17) + ($105<<1)|0);
  $107 = HEAP16[$106>>1]|0;
  $108 = $107&65535;
  $109 = ($108>>>0)>($$>>>0);
  if (!($109)) {
   $best_len$3 = $best_len$2;
   label = 20;
   break;
  }
  $110 = (($chain_length$1) + -1)|0;
  $111 = ($110|0)==(0);
  if ($111) {
   $best_len$3 = $best_len$2;
   label = 20;
   break;
  } else {
   $$01 = $108;$best_len$0 = $best_len$2;$chain_length$1 = $110;$scan$0 = $scan$3;$scan_end$0 = $scan_end$2;$scan_end1$0 = $scan_end1$2;
  }
 }
 if ((label|0) == 20) {
  $112 = ($best_len$3>>>0)>($31>>>0);
  $$best_len$3 = $112 ? $31 : $best_len$3;
  return ($$best_len$3|0);
 }
 return (0)|0;
}
function _deflate_slow($s,$flush) {
 $s = $s|0;
 $flush = $flush|0;
 var $$ = 0, $$0 = 0, $$18 = 0, $$19 = 0, $$20 = 0, $$21 = 0, $$22 = 0, $$not = 0, $$not17 = 0, $$pn = 0, $$pr = 0, $$pre = 0, $$pre$phi12Z2D = 0, $$pre$phi14Z2D = 0, $$pre$phi16Z2D = 0, $$pre$phiZ2D = 0, $$pre10 = 0, $$pre11 = 0, $$pre13 = 0, $$pre15 = 0;
 var $$sink = 0, $$sink$in = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0;
 var $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0;
 var $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0;
 var $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0;
 var $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0;
 var $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0;
 var $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0;
 var $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0;
 var $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0;
 var $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0;
 var $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0;
 var $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0;
 var $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0;
 var $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0;
 var $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0;
 var $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0;
 var $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0;
 var $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0;
 var $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0;
 var $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0;
 var $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0;
 var $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0;
 var $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0;
 var $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0;
 var $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $brmerge = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($s)) + 116|0);
 $1 = ((($s)) + 72|0);
 $2 = ((($s)) + 88|0);
 $3 = ((($s)) + 108|0);
 $4 = ((($s)) + 56|0);
 $5 = ((($s)) + 84|0);
 $6 = ((($s)) + 68|0);
 $7 = ((($s)) + 52|0);
 $8 = ((($s)) + 64|0);
 $9 = ((($s)) + 96|0);
 $10 = ((($s)) + 120|0);
 $11 = ((($s)) + 112|0);
 $12 = ((($s)) + 100|0);
 $13 = ((($s)) + 5792|0);
 $14 = ((($s)) + 5796|0);
 $15 = ((($s)) + 5784|0);
 $16 = ((($s)) + 5788|0);
 $17 = ((($s)) + 104|0);
 $18 = ((($s)) + 92|0);
 $19 = ((($s)) + 128|0);
 $20 = ((($s)) + 44|0);
 $21 = ((($s)) + 136|0);
 L1: while(1) {
  $$pr = HEAP32[$0>>2]|0;
  $23 = $$pr;
  while(1) {
   $22 = ($23>>>0)<(262);
   if ($22) {
    _fill_window($s);
    $24 = HEAP32[$0>>2]|0;
    $$not = ($24>>>0)>(261);
    $$not17 = ($flush|0)!=(0);
    $brmerge = $$not | $$not17;
    if (!($brmerge)) {
     $$0 = 0;
     label = 74;
     break L1;
    }
    $25 = ($24|0)==(0);
    if ($25) {
     label = 47;
     break L1;
    } else {
     $27 = $24;
    }
    $26 = ($27>>>0)>(2);
    if ($26) {
     label = 8;
    } else {
     $28 = HEAP32[$9>>2]|0;
     HEAP32[$10>>2] = $28;
     $29 = HEAP32[$11>>2]|0;
     HEAP32[$12>>2] = $29;
     HEAP32[$9>>2] = 2;
     $77 = 2;
    }
   } else {
    label = 8;
   }
   do {
    if ((label|0) == 8) {
     label = 0;
     $30 = HEAP32[$1>>2]|0;
     $31 = HEAP32[$2>>2]|0;
     $32 = $30 << $31;
     $33 = HEAP32[$3>>2]|0;
     $34 = (($33) + 2)|0;
     $35 = HEAP32[$4>>2]|0;
     $36 = (($35) + ($34)|0);
     $37 = HEAP8[$36>>0]|0;
     $38 = $37&255;
     $39 = $32 ^ $38;
     $40 = HEAP32[$5>>2]|0;
     $41 = $39 & $40;
     HEAP32[$1>>2] = $41;
     $42 = HEAP32[$6>>2]|0;
     $43 = (($42) + ($41<<1)|0);
     $44 = HEAP16[$43>>1]|0;
     $45 = HEAP32[$7>>2]|0;
     $46 = $33 & $45;
     $47 = HEAP32[$8>>2]|0;
     $48 = (($47) + ($46<<1)|0);
     HEAP16[$48>>1] = $44;
     $49 = $44&65535;
     $50 = HEAP32[$3>>2]|0;
     $51 = $50&65535;
     $52 = HEAP32[$1>>2]|0;
     $53 = HEAP32[$6>>2]|0;
     $54 = (($53) + ($52<<1)|0);
     HEAP16[$54>>1] = $51;
     $55 = HEAP32[$9>>2]|0;
     HEAP32[$10>>2] = $55;
     $56 = HEAP32[$11>>2]|0;
     HEAP32[$12>>2] = $56;
     HEAP32[$9>>2] = 2;
     $57 = ($49|0)==(0);
     if ($57) {
      $77 = 2;
     } else {
      $58 = HEAP32[$19>>2]|0;
      $59 = ($55>>>0)<($58>>>0);
      if ($59) {
       $60 = HEAP32[$3>>2]|0;
       $61 = (($60) - ($49))|0;
       $62 = HEAP32[$20>>2]|0;
       $63 = (($62) + -262)|0;
       $64 = ($61>>>0)>($63>>>0);
       if ($64) {
        $77 = 2;
       } else {
        $65 = (_longest_match($s,$49)|0);
        HEAP32[$9>>2] = $65;
        $66 = ($65>>>0)<(6);
        if ($66) {
         $67 = HEAP32[$21>>2]|0;
         $68 = ($67|0)==(1);
         if (!($68)) {
          $69 = ($65|0)==(3);
          if (!($69)) {
           $77 = $65;
           break;
          }
          $70 = HEAP32[$3>>2]|0;
          $71 = HEAP32[$11>>2]|0;
          $72 = (($70) - ($71))|0;
          $73 = ($72>>>0)>(4096);
          if (!($73)) {
           $77 = 3;
           break;
          }
         }
         HEAP32[$9>>2] = 2;
         $77 = 2;
        } else {
         $77 = $65;
        }
       }
      } else {
       $77 = 2;
      }
     }
    }
   } while(0);
   $74 = HEAP32[$10>>2]|0;
   $75 = ($74>>>0)<(3);
   $76 = ($77>>>0)>($74>>>0);
   $or$cond = $75 | $76;
   if (!($or$cond)) {
    break;
   }
   $223 = HEAP32[$17>>2]|0;
   $224 = ($223|0)==(0);
   if ($224) {
    HEAP32[$17>>2] = 1;
    $320 = HEAP32[$3>>2]|0;
    $321 = (($320) + 1)|0;
    HEAP32[$3>>2] = $321;
    $322 = HEAP32[$0>>2]|0;
    $323 = (($322) + -1)|0;
    HEAP32[$0>>2] = $323;
    $23 = $323;
    continue;
   }
   $225 = HEAP32[$3>>2]|0;
   $226 = (($225) + -1)|0;
   $227 = HEAP32[$4>>2]|0;
   $228 = (($227) + ($226)|0);
   $229 = HEAP8[$228>>0]|0;
   $230 = HEAP32[$13>>2]|0;
   $231 = HEAP32[$14>>2]|0;
   $232 = (($231) + ($230<<1)|0);
   HEAP16[$232>>1] = 0;
   $233 = HEAP32[$13>>2]|0;
   $234 = (($233) + 1)|0;
   HEAP32[$13>>2] = $234;
   $235 = HEAP32[$15>>2]|0;
   $236 = (($235) + ($233)|0);
   HEAP8[$236>>0] = $229;
   $237 = $229&255;
   $238 = (((($s)) + 148|0) + ($237<<2)|0);
   $239 = HEAP16[$238>>1]|0;
   $240 = (($239) + 1)<<16>>16;
   HEAP16[$238>>1] = $240;
   $241 = HEAP32[$13>>2]|0;
   $242 = HEAP32[$16>>2]|0;
   $243 = (($242) + -1)|0;
   $244 = ($241|0)==($243|0);
   if ($244) {
    $245 = HEAP32[$18>>2]|0;
    $246 = ($245|0)>(-1);
    if ($246) {
     $247 = HEAP32[$4>>2]|0;
     $248 = (($247) + ($245)|0);
     $251 = $248;
    } else {
     $251 = 0;
    }
    $249 = HEAP32[$3>>2]|0;
    $250 = (($249) - ($245))|0;
    __tr_flush_block($s,$251,$250,0);
    $252 = HEAP32[$3>>2]|0;
    HEAP32[$18>>2] = $252;
    $253 = HEAP32[$s>>2]|0;
    $254 = ((($253)) + 28|0);
    $255 = HEAP32[$254>>2]|0;
    $256 = ((($255)) + 5820|0);
    $257 = HEAP32[$256>>2]|0;
    $258 = ($257|0)==(16);
    do {
     if ($258) {
      $259 = ((($255)) + 5816|0);
      $260 = HEAP16[$259>>1]|0;
      $261 = $260&255;
      $262 = ((($255)) + 20|0);
      $263 = HEAP32[$262>>2]|0;
      $264 = (($263) + 1)|0;
      HEAP32[$262>>2] = $264;
      $265 = ((($255)) + 8|0);
      $266 = HEAP32[$265>>2]|0;
      $267 = (($266) + ($263)|0);
      HEAP8[$267>>0] = $261;
      $268 = HEAP16[$259>>1]|0;
      $269 = ($268&65535) >>> 8;
      $270 = $269&255;
      $271 = HEAP32[$262>>2]|0;
      $272 = (($271) + 1)|0;
      HEAP32[$262>>2] = $272;
      $273 = HEAP32[$265>>2]|0;
      $274 = (($273) + ($271)|0);
      HEAP8[$274>>0] = $270;
      HEAP16[$259>>1] = 0;
      HEAP32[$256>>2] = 0;
      $$pre$phi14Z2D = $262;
     } else {
      $275 = ($257|0)>(7);
      if ($275) {
       $276 = ((($255)) + 5816|0);
       $277 = HEAP16[$276>>1]|0;
       $278 = $277&255;
       $279 = ((($255)) + 20|0);
       $280 = HEAP32[$279>>2]|0;
       $281 = (($280) + 1)|0;
       HEAP32[$279>>2] = $281;
       $282 = ((($255)) + 8|0);
       $283 = HEAP32[$282>>2]|0;
       $284 = (($283) + ($280)|0);
       HEAP8[$284>>0] = $278;
       $285 = HEAP16[$276>>1]|0;
       $286 = ($285&65535) >>> 8;
       HEAP16[$276>>1] = $286;
       $287 = HEAP32[$256>>2]|0;
       $288 = (($287) + -8)|0;
       HEAP32[$256>>2] = $288;
       $$pre$phi14Z2D = $279;
       break;
      } else {
       $$pre13 = ((($255)) + 20|0);
       $$pre$phi14Z2D = $$pre13;
       break;
      }
     }
    } while(0);
    $289 = HEAP32[$$pre$phi14Z2D>>2]|0;
    $290 = ((($253)) + 16|0);
    $291 = HEAP32[$290>>2]|0;
    $292 = ($289>>>0)>($291>>>0);
    $$18 = $292 ? $291 : $289;
    $293 = ($$18|0)==(0);
    if (!($293)) {
     $294 = ((($253)) + 12|0);
     $295 = HEAP32[$294>>2]|0;
     $296 = ((($255)) + 16|0);
     $297 = HEAP32[$296>>2]|0;
     _memcpy(($295|0),($297|0),($$18|0))|0;
     $298 = HEAP32[$294>>2]|0;
     $299 = (($298) + ($$18)|0);
     HEAP32[$294>>2] = $299;
     $300 = HEAP32[$296>>2]|0;
     $301 = (($300) + ($$18)|0);
     HEAP32[$296>>2] = $301;
     $302 = ((($253)) + 20|0);
     $303 = HEAP32[$302>>2]|0;
     $304 = (($303) + ($$18))|0;
     HEAP32[$302>>2] = $304;
     $305 = HEAP32[$290>>2]|0;
     $306 = (($305) - ($$18))|0;
     HEAP32[$290>>2] = $306;
     $307 = HEAP32[$$pre$phi14Z2D>>2]|0;
     $308 = (($307) - ($$18))|0;
     HEAP32[$$pre$phi14Z2D>>2] = $308;
     $309 = ($307|0)==($$18|0);
     if ($309) {
      $310 = ((($255)) + 8|0);
      $311 = HEAP32[$310>>2]|0;
      HEAP32[$296>>2] = $311;
     }
    }
   }
   $312 = HEAP32[$3>>2]|0;
   $313 = (($312) + 1)|0;
   HEAP32[$3>>2] = $313;
   $314 = HEAP32[$0>>2]|0;
   $315 = (($314) + -1)|0;
   HEAP32[$0>>2] = $315;
   $316 = HEAP32[$s>>2]|0;
   $317 = ((($316)) + 16|0);
   $318 = HEAP32[$317>>2]|0;
   $319 = ($318|0)==(0);
   if ($319) {
    $$0 = 0;
    label = 74;
    break L1;
   } else {
    $23 = $315;
   }
  }
  $78 = HEAP32[$3>>2]|0;
  $79 = HEAP32[$0>>2]|0;
  $80 = (($78) + ($79))|0;
  $81 = (($80) + -3)|0;
  $82 = (($74) + 253)|0;
  $83 = $82&255;
  $84 = (($78) + 65535)|0;
  $85 = HEAP32[$12>>2]|0;
  $86 = (($84) - ($85))|0;
  $87 = $86&65535;
  $88 = HEAP32[$13>>2]|0;
  $89 = HEAP32[$14>>2]|0;
  $90 = (($89) + ($88<<1)|0);
  HEAP16[$90>>1] = $87;
  $91 = HEAP32[$13>>2]|0;
  $92 = (($91) + 1)|0;
  HEAP32[$13>>2] = $92;
  $93 = HEAP32[$15>>2]|0;
  $94 = (($93) + ($91)|0);
  HEAP8[$94>>0] = $83;
  $95 = (($87) + -1)<<16>>16;
  $96 = $82 & 255;
  $97 = (14341 + ($96)|0);
  $98 = HEAP8[$97>>0]|0;
  $99 = $98&255;
  $100 = $99 | 256;
  $101 = (($100) + 1)|0;
  $102 = (((($s)) + 148|0) + ($101<<2)|0);
  $103 = HEAP16[$102>>1]|0;
  $104 = (($103) + 1)<<16>>16;
  HEAP16[$102>>1] = $104;
  $105 = ($95&65535)<(256);
  $106 = $95&65535;
  $107 = $106 >>> 7;
  $108 = (($107) + 256)|0;
  $$pn = $105 ? $106 : $108;
  $$sink$in = (13829 + ($$pn)|0);
  $$sink = HEAP8[$$sink$in>>0]|0;
  $109 = $$sink&255;
  $110 = (((($s)) + 2440|0) + ($109<<2)|0);
  $111 = HEAP16[$110>>1]|0;
  $112 = (($111) + 1)<<16>>16;
  HEAP16[$110>>1] = $112;
  $113 = HEAP32[$13>>2]|0;
  $114 = HEAP32[$16>>2]|0;
  $115 = (($114) + -1)|0;
  $116 = HEAP32[$10>>2]|0;
  $117 = (($116) + -1)|0;
  $118 = HEAP32[$0>>2]|0;
  $119 = (($118) - ($117))|0;
  HEAP32[$0>>2] = $119;
  $120 = (($116) + -2)|0;
  HEAP32[$10>>2] = $120;
  $488 = $120;
  while(1) {
   $121 = HEAP32[$3>>2]|0;
   $122 = (($121) + 1)|0;
   HEAP32[$3>>2] = $122;
   $123 = ($122>>>0)>($81>>>0);
   if ($123) {
    $148 = $488;
   } else {
    $124 = HEAP32[$1>>2]|0;
    $125 = HEAP32[$2>>2]|0;
    $126 = $124 << $125;
    $127 = (($121) + 3)|0;
    $128 = HEAP32[$4>>2]|0;
    $129 = (($128) + ($127)|0);
    $130 = HEAP8[$129>>0]|0;
    $131 = $130&255;
    $132 = $126 ^ $131;
    $133 = HEAP32[$5>>2]|0;
    $134 = $132 & $133;
    HEAP32[$1>>2] = $134;
    $135 = HEAP32[$6>>2]|0;
    $136 = (($135) + ($134<<1)|0);
    $137 = HEAP16[$136>>1]|0;
    $138 = HEAP32[$7>>2]|0;
    $139 = $122 & $138;
    $140 = HEAP32[$8>>2]|0;
    $141 = (($140) + ($139<<1)|0);
    HEAP16[$141>>1] = $137;
    $142 = HEAP32[$3>>2]|0;
    $143 = $142&65535;
    $144 = HEAP32[$1>>2]|0;
    $145 = HEAP32[$6>>2]|0;
    $146 = (($145) + ($144<<1)|0);
    HEAP16[$146>>1] = $143;
    $$pre = HEAP32[$10>>2]|0;
    $148 = $$pre;
   }
   $147 = (($148) + -1)|0;
   HEAP32[$10>>2] = $147;
   $149 = ($147|0)==(0);
   if ($149) {
    break;
   } else {
    $488 = $147;
   }
  }
  $150 = ($113|0)==($115|0);
  HEAP32[$17>>2] = 0;
  HEAP32[$9>>2] = 2;
  $151 = HEAP32[$3>>2]|0;
  $152 = (($151) + 1)|0;
  HEAP32[$3>>2] = $152;
  if (!($150)) {
   continue;
  }
  $153 = HEAP32[$18>>2]|0;
  $154 = ($153|0)>(-1);
  if ($154) {
   $155 = HEAP32[$4>>2]|0;
   $156 = (($155) + ($153)|0);
   $158 = $156;
  } else {
   $158 = 0;
  }
  $157 = (($152) - ($153))|0;
  __tr_flush_block($s,$158,$157,0);
  $159 = HEAP32[$3>>2]|0;
  HEAP32[$18>>2] = $159;
  $160 = HEAP32[$s>>2]|0;
  $161 = ((($160)) + 28|0);
  $162 = HEAP32[$161>>2]|0;
  $163 = ((($162)) + 5820|0);
  $164 = HEAP32[$163>>2]|0;
  $165 = ($164|0)==(16);
  do {
   if ($165) {
    $166 = ((($162)) + 5816|0);
    $167 = HEAP16[$166>>1]|0;
    $168 = $167&255;
    $169 = ((($162)) + 20|0);
    $170 = HEAP32[$169>>2]|0;
    $171 = (($170) + 1)|0;
    HEAP32[$169>>2] = $171;
    $172 = ((($162)) + 8|0);
    $173 = HEAP32[$172>>2]|0;
    $174 = (($173) + ($170)|0);
    HEAP8[$174>>0] = $168;
    $175 = HEAP16[$166>>1]|0;
    $176 = ($175&65535) >>> 8;
    $177 = $176&255;
    $178 = HEAP32[$169>>2]|0;
    $179 = (($178) + 1)|0;
    HEAP32[$169>>2] = $179;
    $180 = HEAP32[$172>>2]|0;
    $181 = (($180) + ($178)|0);
    HEAP8[$181>>0] = $177;
    HEAP16[$166>>1] = 0;
    HEAP32[$163>>2] = 0;
    $$pre$phi16Z2D = $169;
   } else {
    $182 = ($164|0)>(7);
    if ($182) {
     $183 = ((($162)) + 5816|0);
     $184 = HEAP16[$183>>1]|0;
     $185 = $184&255;
     $186 = ((($162)) + 20|0);
     $187 = HEAP32[$186>>2]|0;
     $188 = (($187) + 1)|0;
     HEAP32[$186>>2] = $188;
     $189 = ((($162)) + 8|0);
     $190 = HEAP32[$189>>2]|0;
     $191 = (($190) + ($187)|0);
     HEAP8[$191>>0] = $185;
     $192 = HEAP16[$183>>1]|0;
     $193 = ($192&65535) >>> 8;
     HEAP16[$183>>1] = $193;
     $194 = HEAP32[$163>>2]|0;
     $195 = (($194) + -8)|0;
     HEAP32[$163>>2] = $195;
     $$pre$phi16Z2D = $186;
     break;
    } else {
     $$pre15 = ((($162)) + 20|0);
     $$pre$phi16Z2D = $$pre15;
     break;
    }
   }
  } while(0);
  $196 = HEAP32[$$pre$phi16Z2D>>2]|0;
  $197 = ((($160)) + 16|0);
  $198 = HEAP32[$197>>2]|0;
  $199 = ($196>>>0)>($198>>>0);
  $$ = $199 ? $198 : $196;
  $200 = ($$|0)==(0);
  if (!($200)) {
   $201 = ((($160)) + 12|0);
   $202 = HEAP32[$201>>2]|0;
   $203 = ((($162)) + 16|0);
   $204 = HEAP32[$203>>2]|0;
   _memcpy(($202|0),($204|0),($$|0))|0;
   $205 = HEAP32[$201>>2]|0;
   $206 = (($205) + ($$)|0);
   HEAP32[$201>>2] = $206;
   $207 = HEAP32[$203>>2]|0;
   $208 = (($207) + ($$)|0);
   HEAP32[$203>>2] = $208;
   $209 = ((($160)) + 20|0);
   $210 = HEAP32[$209>>2]|0;
   $211 = (($210) + ($$))|0;
   HEAP32[$209>>2] = $211;
   $212 = HEAP32[$197>>2]|0;
   $213 = (($212) - ($$))|0;
   HEAP32[$197>>2] = $213;
   $214 = HEAP32[$$pre$phi16Z2D>>2]|0;
   $215 = (($214) - ($$))|0;
   HEAP32[$$pre$phi16Z2D>>2] = $215;
   $216 = ($214|0)==($$|0);
   if ($216) {
    $217 = ((($162)) + 8|0);
    $218 = HEAP32[$217>>2]|0;
    HEAP32[$203>>2] = $218;
   }
  }
  $219 = HEAP32[$s>>2]|0;
  $220 = ((($219)) + 16|0);
  $221 = HEAP32[$220>>2]|0;
  $222 = ($221|0)==(0);
  if ($222) {
   $$0 = 0;
   label = 74;
   break;
  }
 }
 if ((label|0) == 47) {
  $324 = HEAP32[$17>>2]|0;
  $325 = ($324|0)==(0);
  if (!($325)) {
   $326 = HEAP32[$3>>2]|0;
   $327 = (($326) + -1)|0;
   $328 = HEAP32[$4>>2]|0;
   $329 = (($328) + ($327)|0);
   $330 = HEAP8[$329>>0]|0;
   $331 = HEAP32[$13>>2]|0;
   $332 = HEAP32[$14>>2]|0;
   $333 = (($332) + ($331<<1)|0);
   HEAP16[$333>>1] = 0;
   $334 = HEAP32[$13>>2]|0;
   $335 = (($334) + 1)|0;
   HEAP32[$13>>2] = $335;
   $336 = HEAP32[$15>>2]|0;
   $337 = (($336) + ($334)|0);
   HEAP8[$337>>0] = $330;
   $338 = $330&255;
   $339 = (((($s)) + 148|0) + ($338<<2)|0);
   $340 = HEAP16[$339>>1]|0;
   $341 = (($340) + 1)<<16>>16;
   HEAP16[$339>>1] = $341;
   HEAP32[$17>>2] = 0;
  }
  $342 = HEAP32[$3>>2]|0;
  $343 = ($342>>>0)<(2);
  $$19 = $343 ? $342 : 2;
  $344 = ((($s)) + 5812|0);
  HEAP32[$344>>2] = $$19;
  $345 = ($flush|0)==(4);
  if ($345) {
   $346 = HEAP32[$18>>2]|0;
   $347 = ($346|0)>(-1);
   if ($347) {
    $348 = HEAP32[$4>>2]|0;
    $349 = (($348) + ($346)|0);
    $351 = $349;
   } else {
    $351 = 0;
   }
   $350 = (($342) - ($346))|0;
   __tr_flush_block($s,$351,$350,1);
   $352 = HEAP32[$3>>2]|0;
   HEAP32[$18>>2] = $352;
   $353 = HEAP32[$s>>2]|0;
   $354 = ((($353)) + 28|0);
   $355 = HEAP32[$354>>2]|0;
   $356 = ((($355)) + 5820|0);
   $357 = HEAP32[$356>>2]|0;
   $358 = ($357|0)==(16);
   do {
    if ($358) {
     $359 = ((($355)) + 5816|0);
     $360 = HEAP16[$359>>1]|0;
     $361 = $360&255;
     $362 = ((($355)) + 20|0);
     $363 = HEAP32[$362>>2]|0;
     $364 = (($363) + 1)|0;
     HEAP32[$362>>2] = $364;
     $365 = ((($355)) + 8|0);
     $366 = HEAP32[$365>>2]|0;
     $367 = (($366) + ($363)|0);
     HEAP8[$367>>0] = $361;
     $368 = HEAP16[$359>>1]|0;
     $369 = ($368&65535) >>> 8;
     $370 = $369&255;
     $371 = HEAP32[$362>>2]|0;
     $372 = (($371) + 1)|0;
     HEAP32[$362>>2] = $372;
     $373 = HEAP32[$365>>2]|0;
     $374 = (($373) + ($371)|0);
     HEAP8[$374>>0] = $370;
     HEAP16[$359>>1] = 0;
     HEAP32[$356>>2] = 0;
     $$pre$phiZ2D = $362;
    } else {
     $375 = ($357|0)>(7);
     if ($375) {
      $376 = ((($355)) + 5816|0);
      $377 = HEAP16[$376>>1]|0;
      $378 = $377&255;
      $379 = ((($355)) + 20|0);
      $380 = HEAP32[$379>>2]|0;
      $381 = (($380) + 1)|0;
      HEAP32[$379>>2] = $381;
      $382 = ((($355)) + 8|0);
      $383 = HEAP32[$382>>2]|0;
      $384 = (($383) + ($380)|0);
      HEAP8[$384>>0] = $378;
      $385 = HEAP16[$376>>1]|0;
      $386 = ($385&65535) >>> 8;
      HEAP16[$376>>1] = $386;
      $387 = HEAP32[$356>>2]|0;
      $388 = (($387) + -8)|0;
      HEAP32[$356>>2] = $388;
      $$pre$phiZ2D = $379;
      break;
     } else {
      $$pre10 = ((($355)) + 20|0);
      $$pre$phiZ2D = $$pre10;
      break;
     }
    }
   } while(0);
   $389 = HEAP32[$$pre$phiZ2D>>2]|0;
   $390 = ((($353)) + 16|0);
   $391 = HEAP32[$390>>2]|0;
   $392 = ($389>>>0)>($391>>>0);
   $$20 = $392 ? $391 : $389;
   $393 = ($$20|0)==(0);
   if ($393) {
    $412 = HEAP32[$s>>2]|0;
    $413 = ((($412)) + 16|0);
    $414 = HEAP32[$413>>2]|0;
    $415 = ($414|0)==(0);
    $$21 = $415 ? 2 : 3;
    return ($$21|0);
   }
   $394 = ((($353)) + 12|0);
   $395 = HEAP32[$394>>2]|0;
   $396 = ((($355)) + 16|0);
   $397 = HEAP32[$396>>2]|0;
   _memcpy(($395|0),($397|0),($$20|0))|0;
   $398 = HEAP32[$394>>2]|0;
   $399 = (($398) + ($$20)|0);
   HEAP32[$394>>2] = $399;
   $400 = HEAP32[$396>>2]|0;
   $401 = (($400) + ($$20)|0);
   HEAP32[$396>>2] = $401;
   $402 = ((($353)) + 20|0);
   $403 = HEAP32[$402>>2]|0;
   $404 = (($403) + ($$20))|0;
   HEAP32[$402>>2] = $404;
   $405 = HEAP32[$390>>2]|0;
   $406 = (($405) - ($$20))|0;
   HEAP32[$390>>2] = $406;
   $407 = HEAP32[$$pre$phiZ2D>>2]|0;
   $408 = (($407) - ($$20))|0;
   HEAP32[$$pre$phiZ2D>>2] = $408;
   $409 = ($407|0)==($$20|0);
   if (!($409)) {
    $412 = HEAP32[$s>>2]|0;
    $413 = ((($412)) + 16|0);
    $414 = HEAP32[$413>>2]|0;
    $415 = ($414|0)==(0);
    $$21 = $415 ? 2 : 3;
    return ($$21|0);
   }
   $410 = ((($355)) + 8|0);
   $411 = HEAP32[$410>>2]|0;
   HEAP32[$396>>2] = $411;
   $412 = HEAP32[$s>>2]|0;
   $413 = ((($412)) + 16|0);
   $414 = HEAP32[$413>>2]|0;
   $415 = ($414|0)==(0);
   $$21 = $415 ? 2 : 3;
   return ($$21|0);
  }
  $416 = HEAP32[$13>>2]|0;
  $417 = ($416|0)==(0);
  if (!($417)) {
   $418 = HEAP32[$18>>2]|0;
   $419 = ($418|0)>(-1);
   if ($419) {
    $420 = HEAP32[$4>>2]|0;
    $421 = (($420) + ($418)|0);
    $423 = $421;
   } else {
    $423 = 0;
   }
   $422 = (($342) - ($418))|0;
   __tr_flush_block($s,$423,$422,0);
   $424 = HEAP32[$3>>2]|0;
   HEAP32[$18>>2] = $424;
   $425 = HEAP32[$s>>2]|0;
   $426 = ((($425)) + 28|0);
   $427 = HEAP32[$426>>2]|0;
   $428 = ((($427)) + 5820|0);
   $429 = HEAP32[$428>>2]|0;
   $430 = ($429|0)==(16);
   do {
    if ($430) {
     $431 = ((($427)) + 5816|0);
     $432 = HEAP16[$431>>1]|0;
     $433 = $432&255;
     $434 = ((($427)) + 20|0);
     $435 = HEAP32[$434>>2]|0;
     $436 = (($435) + 1)|0;
     HEAP32[$434>>2] = $436;
     $437 = ((($427)) + 8|0);
     $438 = HEAP32[$437>>2]|0;
     $439 = (($438) + ($435)|0);
     HEAP8[$439>>0] = $433;
     $440 = HEAP16[$431>>1]|0;
     $441 = ($440&65535) >>> 8;
     $442 = $441&255;
     $443 = HEAP32[$434>>2]|0;
     $444 = (($443) + 1)|0;
     HEAP32[$434>>2] = $444;
     $445 = HEAP32[$437>>2]|0;
     $446 = (($445) + ($443)|0);
     HEAP8[$446>>0] = $442;
     HEAP16[$431>>1] = 0;
     HEAP32[$428>>2] = 0;
     $$pre$phi12Z2D = $434;
    } else {
     $447 = ($429|0)>(7);
     if ($447) {
      $448 = ((($427)) + 5816|0);
      $449 = HEAP16[$448>>1]|0;
      $450 = $449&255;
      $451 = ((($427)) + 20|0);
      $452 = HEAP32[$451>>2]|0;
      $453 = (($452) + 1)|0;
      HEAP32[$451>>2] = $453;
      $454 = ((($427)) + 8|0);
      $455 = HEAP32[$454>>2]|0;
      $456 = (($455) + ($452)|0);
      HEAP8[$456>>0] = $450;
      $457 = HEAP16[$448>>1]|0;
      $458 = ($457&65535) >>> 8;
      HEAP16[$448>>1] = $458;
      $459 = HEAP32[$428>>2]|0;
      $460 = (($459) + -8)|0;
      HEAP32[$428>>2] = $460;
      $$pre$phi12Z2D = $451;
      break;
     } else {
      $$pre11 = ((($427)) + 20|0);
      $$pre$phi12Z2D = $$pre11;
      break;
     }
    }
   } while(0);
   $461 = HEAP32[$$pre$phi12Z2D>>2]|0;
   $462 = ((($425)) + 16|0);
   $463 = HEAP32[$462>>2]|0;
   $464 = ($461>>>0)>($463>>>0);
   $$22 = $464 ? $463 : $461;
   $465 = ($$22|0)==(0);
   if (!($465)) {
    $466 = ((($425)) + 12|0);
    $467 = HEAP32[$466>>2]|0;
    $468 = ((($427)) + 16|0);
    $469 = HEAP32[$468>>2]|0;
    _memcpy(($467|0),($469|0),($$22|0))|0;
    $470 = HEAP32[$466>>2]|0;
    $471 = (($470) + ($$22)|0);
    HEAP32[$466>>2] = $471;
    $472 = HEAP32[$468>>2]|0;
    $473 = (($472) + ($$22)|0);
    HEAP32[$468>>2] = $473;
    $474 = ((($425)) + 20|0);
    $475 = HEAP32[$474>>2]|0;
    $476 = (($475) + ($$22))|0;
    HEAP32[$474>>2] = $476;
    $477 = HEAP32[$462>>2]|0;
    $478 = (($477) - ($$22))|0;
    HEAP32[$462>>2] = $478;
    $479 = HEAP32[$$pre$phi12Z2D>>2]|0;
    $480 = (($479) - ($$22))|0;
    HEAP32[$$pre$phi12Z2D>>2] = $480;
    $481 = ($479|0)==($$22|0);
    if ($481) {
     $482 = ((($427)) + 8|0);
     $483 = HEAP32[$482>>2]|0;
     HEAP32[$468>>2] = $483;
    }
   }
   $484 = HEAP32[$s>>2]|0;
   $485 = ((($484)) + 16|0);
   $486 = HEAP32[$485>>2]|0;
   $487 = ($486|0)==(0);
   if ($487) {
    $$0 = 0;
    return ($$0|0);
   }
  }
  $$0 = 1;
  return ($$0|0);
 }
 else if ((label|0) == 74) {
  return ($$0|0);
 }
 return (0)|0;
}
function _inflate_table($type,$lens,$codes,$table,$bits,$work) {
 $type = $type|0;
 $lens = $lens|0;
 $codes = $codes|0;
 $table = $table|0;
 $bits = $bits|0;
 $work = $work|0;
 var $$0 = 0, $$cast = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0;
 var $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0;
 var $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0;
 var $150 = 0, $151 = 0, $152 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0;
 var $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0;
 var $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0;
 var $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0;
 var $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $base$017 = 0, $count = 0, $curr$0$ph = 0, $curr$1 = 0, $drop$0$ph = 0;
 var $end$035 = 0, $exitcond = 0, $exitcond26 = 0, $exitcond27 = 0, $exitcond28 = 0, $extra$026 = 0, $fill$0 = 0, $here$sroa$0$0 = 0, $here$sroa$11$0 = 0, $huff$0 = 0, $huff$0$ph = 0, $huff$1 = 0, $incr$0 = 0, $left$0 = 0, $left$1 = 0, $len$0 = 0, $len$1 = 0, $len$2 = 0, $len$3 = 0, $len$3$ph = 0;
 var $len$4 = 0, $low$0$ph = 0, $max$0 = 0, $max$0$lcssa = 0, $max$0$lcssa$ = 0, $min$0 = 0, $min$0$max$0$lcssa$ = 0, $min$0$max$0$lcssa$$drop$0$ph = 0, $next$0$ph = 0, $offs = 0, $or$cond = 0, $or$cond29 = 0, $sym$0 = 0, $sym$1 = 0, $sym$2 = 0, $sym$2$ph = 0, $used$0$ph = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $count = sp + 32|0;
 $offs = sp;
 $len$0 = 0;
 while(1) {
  $exitcond28 = ($len$0|0)==(16);
  if ($exitcond28) {
   $sym$0 = 0;
   break;
  }
  $0 = (($count) + ($len$0<<1)|0);
  HEAP16[$0>>1] = 0;
  $1 = (($len$0) + 1)|0;
  $len$0 = $1;
 }
 while(1) {
  $exitcond27 = ($sym$0|0)==($codes|0);
  if ($exitcond27) {
   break;
  }
  $2 = (($lens) + ($sym$0<<1)|0);
  $3 = HEAP16[$2>>1]|0;
  $4 = $3&65535;
  $5 = (($count) + ($4<<1)|0);
  $6 = HEAP16[$5>>1]|0;
  $7 = (($6) + 1)<<16>>16;
  HEAP16[$5>>1] = $7;
  $8 = (($sym$0) + 1)|0;
  $sym$0 = $8;
 }
 $9 = HEAP32[$bits>>2]|0;
 $max$0 = 15;
 while(1) {
  $10 = ($max$0|0)==(0);
  if ($10) {
   label = 11;
   break;
  }
  $11 = (($count) + ($max$0<<1)|0);
  $12 = HEAP16[$11>>1]|0;
  $13 = ($12<<16>>16)==(0);
  if (!($13)) {
   $max$0$lcssa = $max$0;
   break;
  }
  $14 = (($max$0) + -1)|0;
  $max$0 = $14;
 }
 if ((label|0) == 11) {
  $16 = HEAP32[$table>>2]|0;
  $17 = ((($16)) + 4|0);
  HEAP32[$table>>2] = $17;
  HEAP16[$16>>1]=320&65535;HEAP16[$16+2>>1]=320>>>16;
  $18 = HEAP32[$table>>2]|0;
  $19 = ((($18)) + 4|0);
  HEAP32[$table>>2] = $19;
  HEAP16[$18>>1]=320&65535;HEAP16[$18+2>>1]=320>>>16;
  HEAP32[$bits>>2] = 1;
  $$0 = 0;
  STACKTOP = sp;return ($$0|0);
 }
 $15 = ($9>>>0)>($max$0$lcssa>>>0);
 $max$0$lcssa$ = $15 ? $max$0$lcssa : $9;
 $min$0 = 1;
 while(1) {
  $20 = ($min$0>>>0)<($max$0$lcssa>>>0);
  if (!($20)) {
   break;
  }
  $21 = (($count) + ($min$0<<1)|0);
  $22 = HEAP16[$21>>1]|0;
  $23 = ($22<<16>>16)==(0);
  if (!($23)) {
   break;
  }
  $24 = (($min$0) + 1)|0;
  $min$0 = $24;
 }
 $25 = ($max$0$lcssa$>>>0)<($min$0>>>0);
 $min$0$max$0$lcssa$ = $25 ? $min$0 : $max$0$lcssa$;
 $left$0 = 1;$len$1 = 1;
 while(1) {
  $26 = ($len$1>>>0)<(16);
  if (!($26)) {
   break;
  }
  $27 = $left$0 << 1;
  $28 = (($count) + ($len$1<<1)|0);
  $29 = HEAP16[$28>>1]|0;
  $30 = $29&65535;
  $31 = (($27) - ($30))|0;
  $32 = ($31|0)<(0);
  if ($32) {
   $$0 = -1;
   label = 60;
   break;
  }
  $33 = (($len$1) + 1)|0;
  $left$0 = $31;$len$1 = $33;
 }
 if ((label|0) == 60) {
  STACKTOP = sp;return ($$0|0);
 }
 $34 = ($left$0|0)>(0);
 if ($34) {
  $35 = ($type|0)!=(0);
  $36 = ($max$0$lcssa|0)==(1);
  $or$cond = $35 & $36;
  if (!($or$cond)) {
   $$0 = -1;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $37 = ((($offs)) + 2|0);
 HEAP16[$37>>1] = 0;
 $39 = 0;$len$2 = 1;
 while(1) {
  $exitcond26 = ($len$2|0)==(15);
  if ($exitcond26) {
   $sym$1 = 0;
   break;
  }
  $38 = $39 & 65535;
  $40 = (($count) + ($len$2<<1)|0);
  $41 = HEAP16[$40>>1]|0;
  $42 = $41&65535;
  $43 = (($38) + ($42))|0;
  $44 = $43&65535;
  $45 = (($len$2) + 1)|0;
  $46 = (($offs) + ($45<<1)|0);
  HEAP16[$46>>1] = $44;
  $39 = $43;$len$2 = $45;
 }
 while(1) {
  $exitcond = ($sym$1|0)==($codes|0);
  if ($exitcond) {
   break;
  }
  $47 = (($lens) + ($sym$1<<1)|0);
  $48 = HEAP16[$47>>1]|0;
  $49 = ($48<<16>>16)==(0);
  if (!($49)) {
   $50 = $sym$1&65535;
   $51 = $48&65535;
   $52 = (($offs) + ($51<<1)|0);
   $53 = HEAP16[$52>>1]|0;
   $54 = (($53) + 1)<<16>>16;
   HEAP16[$52>>1] = $54;
   $55 = $53&65535;
   $56 = (($work) + ($55<<1)|0);
   HEAP16[$56>>1] = $50;
  }
  $57 = (($sym$1) + 1)|0;
  $sym$1 = $57;
 }
 switch ($type|0) {
 case 0:  {
  $58 = 1 << $min$0$max$0$lcssa$;
  $65 = $58;$base$017 = $work;$end$035 = 19;$extra$026 = $work;
  break;
 }
 case 1:  {
  $59 = 1 << $min$0$max$0$lcssa$;
  $60 = ($min$0$max$0$lcssa$>>>0)>(9);
  if ($60) {
   $$0 = 1;
   STACKTOP = sp;return ($$0|0);
  } else {
   $65 = $59;$base$017 = (11196);$end$035 = 256;$extra$026 = (11258);
  }
  break;
 }
 default: {
  $61 = 1 << $min$0$max$0$lcssa$;
  $62 = ($type|0)==(2);
  $63 = ($min$0$max$0$lcssa$>>>0)>(9);
  $or$cond29 = $62 & $63;
  if ($or$cond29) {
   $$0 = 1;
   STACKTOP = sp;return ($$0|0);
  } else {
   $65 = $61;$base$017 = 11834;$end$035 = -1;$extra$026 = 11898;
  }
 }
 }
 $64 = (($65) + -1)|0;
 $66 = HEAP32[$table>>2]|0;
 $67 = $min$0$max$0$lcssa$&255;
 $curr$0$ph = $min$0$max$0$lcssa$;$drop$0$ph = 0;$huff$0$ph = 0;$len$3$ph = $min$0;$low$0$ph = -1;$next$0$ph = $66;$sym$2$ph = 0;$used$0$ph = $65;
 L49: while(1) {
  $68 = 1 << $curr$0$ph;
  $huff$0 = $huff$0$ph;$len$3 = $len$3$ph;$sym$2 = $sym$2$ph;
  while(1) {
   $69 = (($len$3) - ($drop$0$ph))|0;
   $70 = (($work) + ($sym$2<<1)|0);
   $71 = HEAP16[$70>>1]|0;
   $72 = $71&65535;
   $73 = ($72|0)<($end$035|0);
   if ($73) {
    $here$sroa$0$0 = 0;$here$sroa$11$0 = $71;
   } else {
    $74 = ($72|0)>($end$035|0);
    if ($74) {
     $75 = (($extra$026) + ($72<<1)|0);
     $76 = HEAP16[$75>>1]|0;
     $77 = $76&65535;
     $78 = (($base$017) + ($72<<1)|0);
     $79 = HEAP16[$78>>1]|0;
     $here$sroa$0$0 = $77;$here$sroa$11$0 = $79;
    } else {
     $here$sroa$0$0 = 96;$here$sroa$11$0 = 0;
    }
   }
   $80 = 1 << $69;
   $81 = $huff$0 >>> $drop$0$ph;
   $82 = $here$sroa$11$0&65535;
   $83 = $82 << 16;
   $84 = $69 << 8;
   $85 = $84 & 65280;
   $86 = $83 | $85;
   $87 = $here$sroa$0$0 & 255;
   $88 = $86 | $87;
   $fill$0 = $68;
   while(1) {
    $89 = (($fill$0) - ($80))|0;
    $90 = (($81) + ($89))|0;
    $91 = (($next$0$ph) + ($90<<2)|0);
    HEAP16[$91>>1]=$88&65535;HEAP16[$91+2>>1]=$88>>>16;
    $92 = ($fill$0|0)==($80|0);
    if ($92) {
     break;
    } else {
     $fill$0 = $89;
    }
   }
   $93 = (($len$3) + -1)|0;
   $94 = 1 << $93;
   $incr$0 = $94;
   while(1) {
    $95 = $huff$0 & $incr$0;
    $96 = ($95|0)==(0);
    if ($96) {
     break;
    }
    $97 = $incr$0 >>> 1;
    $incr$0 = $97;
   }
   $98 = ($incr$0|0)==(0);
   if ($98) {
    $huff$1 = 0;
   } else {
    $99 = (($incr$0) + -1)|0;
    $100 = $huff$0 & $99;
    $101 = (($100) + ($incr$0))|0;
    $huff$1 = $101;
   }
   $102 = (($sym$2) + 1)|0;
   $103 = (($count) + ($len$3<<1)|0);
   $104 = HEAP16[$103>>1]|0;
   $105 = (($104) + -1)<<16>>16;
   HEAP16[$103>>1] = $105;
   $106 = ($105<<16>>16)==(0);
   if ($106) {
    $107 = ($len$3|0)==($max$0$lcssa|0);
    if ($107) {
     label = 57;
     break L49;
    }
    $108 = (($work) + ($102<<1)|0);
    $109 = HEAP16[$108>>1]|0;
    $110 = $109&65535;
    $111 = (($lens) + ($110<<1)|0);
    $112 = HEAP16[$111>>1]|0;
    $113 = $112&65535;
    $len$4 = $113;
   } else {
    $len$4 = $len$3;
   }
   $114 = ($len$4>>>0)>($min$0$max$0$lcssa$>>>0);
   if (!($114)) {
    $huff$0 = $huff$1;$len$3 = $len$4;$sym$2 = $102;
    continue;
   }
   $115 = $huff$1 & $64;
   $116 = ($115|0)==($low$0$ph|0);
   if ($116) {
    $huff$0 = $huff$1;$len$3 = $len$4;$sym$2 = $102;
   } else {
    break;
   }
  }
  $117 = ($drop$0$ph|0)==(0);
  $min$0$max$0$lcssa$$drop$0$ph = $117 ? $min$0$max$0$lcssa$ : $drop$0$ph;
  $118 = (($next$0$ph) + ($68<<2)|0);
  $119 = (($len$4) - ($min$0$max$0$lcssa$$drop$0$ph))|0;
  $120 = 1 << $119;
  $curr$1 = $119;$left$1 = $120;
  while(1) {
   $121 = (($curr$1) + ($min$0$max$0$lcssa$$drop$0$ph))|0;
   $122 = ($121>>>0)<($max$0$lcssa>>>0);
   if (!($122)) {
    break;
   }
   $123 = (($count) + ($121<<1)|0);
   $124 = HEAP16[$123>>1]|0;
   $125 = $124&65535;
   $126 = (($left$1) - ($125))|0;
   $127 = ($126|0)<(1);
   if ($127) {
    break;
   }
   $128 = (($curr$1) + 1)|0;
   $129 = $126 << 1;
   $curr$1 = $128;$left$1 = $129;
  }
  $130 = 1 << $curr$1;
  $131 = (($used$0$ph) + ($130))|0;
  switch ($type|0) {
  case 1:  {
   $132 = ($131>>>0)>(852);
   if ($132) {
    $$0 = 1;
    label = 60;
    break L49;
   }
   break;
  }
  case 2:  {
   $133 = ($131>>>0)>(592);
   if ($133) {
    $$0 = 1;
    label = 60;
    break L49;
   }
   break;
  }
  default: {
  }
  }
  $134 = $curr$1&255;
  $135 = HEAP32[$table>>2]|0;
  $136 = (($135) + ($115<<2)|0);
  HEAP8[$136>>0] = $134;
  $137 = HEAP32[$table>>2]|0;
  $138 = (((($137) + ($115<<2)|0)) + 1|0);
  HEAP8[$138>>0] = $67;
  $139 = HEAP32[$table>>2]|0;
  $140 = $118;
  $141 = (($140) - ($139))|0;
  $142 = $141 >>> 2;
  $143 = $142&65535;
  $$cast = $139;
  $144 = (((($$cast) + ($115<<2)|0)) + 2|0);
  HEAP16[$144>>1] = $143;
  $curr$0$ph = $curr$1;$drop$0$ph = $min$0$max$0$lcssa$$drop$0$ph;$huff$0$ph = $huff$1;$len$3$ph = $len$4;$low$0$ph = $115;$next$0$ph = $118;$sym$2$ph = $102;$used$0$ph = $131;
 }
 if ((label|0) == 57) {
  $145 = ($huff$1|0)==(0);
  if (!($145)) {
   $146 = (($max$0$lcssa) - ($drop$0$ph))|0;
   $147 = (($next$0$ph) + ($huff$1<<2)|0);
   $148 = $146 << 8;
   $149 = $148 & 65280;
   $150 = $149 | 64;
   HEAP16[$147>>1]=$150&65535;HEAP16[$147+2>>1]=$150>>>16;
  }
  $151 = HEAP32[$table>>2]|0;
  $152 = (($151) + ($used$0$ph<<2)|0);
  HEAP32[$table>>2] = $152;
  HEAP32[$bits>>2] = $min$0$max$0$lcssa$;
  $$0 = 0;
  STACKTOP = sp;return ($$0|0);
 }
 else if ((label|0) == 60) {
  STACKTOP = sp;return ($$0|0);
 }
 return (0)|0;
}
function __tr_flush_block($s,$buf,$stored_len,$last) {
 $s = $s|0;
 $buf = $buf|0;
 $stored_len = $stored_len|0;
 $last = $last|0;
 var $$ = 0, $$0$i = 0, $$0$i$i = 0, $$01$i$i = 0, $$off0 = 0, $$off0$in = 0, $$pre = 0, $$pre$phi10Z2D = 0, $$pre$phi12Z2D = 0, $$pre$phi14Z2D = 0, $$pre$phi16Z2D = 0, $$pre$phi18Z2D = 0, $$pre$phi8Z2D = 0, $$pre17 = 0, $$pre9 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0;
 var $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0;
 var $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0;
 var $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0;
 var $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0;
 var $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0;
 var $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0;
 var $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0;
 var $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0;
 var $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0;
 var $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0;
 var $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0;
 var $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0;
 var $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0;
 var $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0;
 var $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0;
 var $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0;
 var $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0;
 var $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0;
 var $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $black_mask$0$i = 0, $exitcond = 0, $exitcond19 = 0, $exitcond20 = 0, $max_blindex$0 = 0, $max_blindex$0$i = 0, $n$0$i = 0;
 var $n$0$i1 = 0, $n$1$i = 0, $n$1$i2 = 0, $n$2$i = 0, $opt_lenb$1 = 0, $or$cond = 0, $or$cond27 = 0, $phitmp = 0, $rank$0$i = 0, $static_lenb$0 = 0, $storemerge = 0, $storemerge22 = 0, $storemerge23 = 0, $storemerge24 = 0, $storemerge25 = 0, $storemerge26 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($s)) + 132|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)>(0);
 if ($2) {
  $3 = HEAP32[$s>>2]|0;
  $4 = ((($3)) + 44|0);
  $5 = HEAP32[$4>>2]|0;
  $6 = ($5|0)==(2);
  if ($6) {
   $black_mask$0$i = -201342849;$n$0$i = 0;
   while(1) {
    $7 = ($n$0$i|0)<(32);
    if (!($7)) {
     label = 7;
     break;
    }
    $8 = $black_mask$0$i & 1;
    $9 = ($8|0)==(0);
    if (!($9)) {
     $10 = (((($s)) + 148|0) + ($n$0$i<<2)|0);
     $11 = HEAP16[$10>>1]|0;
     $12 = ($11<<16>>16)==(0);
     if (!($12)) {
      $$0$i = 0;
      break;
     }
    }
    $13 = (($n$0$i) + 1)|0;
    $14 = $black_mask$0$i >>> 1;
    $black_mask$0$i = $14;$n$0$i = $13;
   }
   L10: do {
    if ((label|0) == 7) {
     $15 = ((($s)) + 184|0);
     $16 = HEAP16[$15>>1]|0;
     $17 = ($16<<16>>16)==(0);
     if ($17) {
      $18 = ((($s)) + 188|0);
      $19 = HEAP16[$18>>1]|0;
      $20 = ($19<<16>>16)==(0);
      if ($20) {
       $21 = ((($s)) + 200|0);
       $22 = HEAP16[$21>>1]|0;
       $23 = ($22<<16>>16)==(0);
       if ($23) {
        $n$1$i = 32;
        while(1) {
         $24 = ($n$1$i|0)<(256);
         if (!($24)) {
          $$0$i = 0;
          break L10;
         }
         $25 = (((($s)) + 148|0) + ($n$1$i<<2)|0);
         $26 = HEAP16[$25>>1]|0;
         $27 = ($26<<16>>16)==(0);
         if (!($27)) {
          $$0$i = 1;
          break L10;
         }
         $28 = (($n$1$i) + 1)|0;
         $n$1$i = $28;
        }
       } else {
        $$0$i = 1;
       }
      } else {
       $$0$i = 1;
      }
     } else {
      $$0$i = 1;
     }
    }
   } while(0);
   HEAP32[$4>>2] = $$0$i;
  }
  $29 = ((($s)) + 2840|0);
  _build_tree($s,$29);
  $30 = ((($s)) + 2852|0);
  _build_tree($s,$30);
  $31 = ((($s)) + 148|0);
  $32 = ((($s)) + 2844|0);
  $33 = HEAP32[$32>>2]|0;
  _scan_tree($s,$31,$33);
  $34 = ((($s)) + 2440|0);
  $35 = ((($s)) + 2856|0);
  $36 = HEAP32[$35>>2]|0;
  _scan_tree($s,$34,$36);
  $37 = ((($s)) + 2864|0);
  _build_tree($s,$37);
  $max_blindex$0$i = 18;
  while(1) {
   $38 = ($max_blindex$0$i|0)>(2);
   if (!($38)) {
    break;
   }
   $39 = (14597 + ($max_blindex$0$i)|0);
   $40 = HEAP8[$39>>0]|0;
   $41 = $40&255;
   $42 = (((((($s)) + 2684|0) + ($41<<2)|0)) + 2|0);
   $43 = HEAP16[$42>>1]|0;
   $44 = ($43<<16>>16)==(0);
   if (!($44)) {
    break;
   }
   $45 = (($max_blindex$0$i) + -1)|0;
   $max_blindex$0$i = $45;
  }
  $46 = ($max_blindex$0$i*3)|0;
  $47 = (($46) + 17)|0;
  $48 = ((($s)) + 5800|0);
  $49 = HEAP32[$48>>2]|0;
  $50 = (($49) + ($47))|0;
  HEAP32[$48>>2] = $50;
  $51 = (($50) + 10)|0;
  $52 = $51 >>> 3;
  $53 = ((($s)) + 5804|0);
  $54 = HEAP32[$53>>2]|0;
  $55 = (($54) + 10)|0;
  $56 = $55 >>> 3;
  $57 = ($56>>>0)>($52>>>0);
  $$ = $57 ? $52 : $56;
  $phitmp = (($max_blindex$0$i) + 1)|0;
  $max_blindex$0 = $phitmp;$opt_lenb$1 = $$;$static_lenb$0 = $56;
 } else {
  $58 = (($stored_len) + 5)|0;
  $max_blindex$0 = 1;$opt_lenb$1 = $58;$static_lenb$0 = $58;
 }
 $59 = (($stored_len) + 4)|0;
 $60 = ($59>>>0)>($opt_lenb$1>>>0);
 $61 = ($buf|0)==(0|0);
 $or$cond = $60 | $61;
 L27: do {
  if ($or$cond) {
   $146 = ((($s)) + 136|0);
   $147 = HEAP32[$146>>2]|0;
   $148 = ($147|0)==(4);
   $149 = ($static_lenb$0|0)==($opt_lenb$1|0);
   $or$cond27 = $148 | $149;
   $150 = ((($s)) + 5820|0);
   $151 = HEAP32[$150>>2]|0;
   $152 = ($151|0)>(13);
   if ($or$cond27) {
    $153 = (($last) + 2)|0;
    $154 = $153 & 65535;
    $155 = $154 << $151;
    $156 = ((($s)) + 5816|0);
    $157 = HEAP16[$156>>1]|0;
    $158 = $157&65535;
    $159 = $158 | $155;
    $160 = $159&65535;
    HEAP16[$156>>1] = $160;
    if ($152) {
     $161 = $159&255;
     $162 = ((($s)) + 20|0);
     $163 = HEAP32[$162>>2]|0;
     $164 = (($163) + 1)|0;
     HEAP32[$162>>2] = $164;
     $165 = ((($s)) + 8|0);
     $166 = HEAP32[$165>>2]|0;
     $167 = (($166) + ($163)|0);
     HEAP8[$167>>0] = $161;
     $168 = HEAP16[$156>>1]|0;
     $169 = ($168&65535) >>> 8;
     $170 = $169&255;
     $171 = HEAP32[$162>>2]|0;
     $172 = (($171) + 1)|0;
     HEAP32[$162>>2] = $172;
     $173 = HEAP32[$165>>2]|0;
     $174 = (($173) + ($171)|0);
     HEAP8[$174>>0] = $170;
     $175 = HEAP32[$150>>2]|0;
     $176 = (16 - ($175))|0;
     $177 = $154 >>> $176;
     $178 = $177&65535;
     HEAP16[$156>>1] = $178;
     $179 = (($175) + -13)|0;
     $storemerge26 = $179;
    } else {
     $180 = (($151) + 3)|0;
     $storemerge26 = $180;
    }
    HEAP32[$150>>2] = $storemerge26;
    _compress_block($s,11962,13114);
    $n$0$i1 = 0;
    break;
   }
   $181 = (($last) + 4)|0;
   $182 = $181 & 65535;
   $183 = $182 << $151;
   $184 = ((($s)) + 5816|0);
   $185 = HEAP16[$184>>1]|0;
   $186 = $185&65535;
   $187 = $186 | $183;
   $188 = $187&65535;
   HEAP16[$184>>1] = $188;
   if ($152) {
    $189 = $187&255;
    $190 = ((($s)) + 20|0);
    $191 = HEAP32[$190>>2]|0;
    $192 = (($191) + 1)|0;
    HEAP32[$190>>2] = $192;
    $193 = ((($s)) + 8|0);
    $194 = HEAP32[$193>>2]|0;
    $195 = (($194) + ($191)|0);
    HEAP8[$195>>0] = $189;
    $196 = HEAP16[$184>>1]|0;
    $197 = ($196&65535) >>> 8;
    $198 = $197&255;
    $199 = HEAP32[$190>>2]|0;
    $200 = (($199) + 1)|0;
    HEAP32[$190>>2] = $200;
    $201 = HEAP32[$193>>2]|0;
    $202 = (($201) + ($199)|0);
    HEAP8[$202>>0] = $198;
    $203 = HEAP32[$150>>2]|0;
    $204 = (16 - ($203))|0;
    $205 = $182 >>> $204;
    $206 = $205&65535;
    HEAP16[$184>>1] = $206;
    $207 = (($203) + -13)|0;
    $219 = $205;$storemerge22 = $207;
   } else {
    $208 = (($151) + 3)|0;
    $219 = $187;$storemerge22 = $208;
   }
   HEAP32[$150>>2] = $storemerge22;
   $209 = ((($s)) + 2844|0);
   $210 = HEAP32[$209>>2]|0;
   $211 = ((($s)) + 2856|0);
   $212 = HEAP32[$211>>2]|0;
   $213 = ($storemerge22|0)>(11);
   $214 = (($210) + 65280)|0;
   $215 = $214 & 65535;
   $216 = $215 << $storemerge22;
   $217 = ((($s)) + 5816|0);
   $218 = $219 & 65535;
   $220 = $218 | $216;
   $221 = $220&65535;
   HEAP16[$217>>1] = $221;
   if ($213) {
    $222 = $220&255;
    $223 = ((($s)) + 20|0);
    $224 = HEAP32[$223>>2]|0;
    $225 = (($224) + 1)|0;
    HEAP32[$223>>2] = $225;
    $226 = ((($s)) + 8|0);
    $227 = HEAP32[$226>>2]|0;
    $228 = (($227) + ($224)|0);
    HEAP8[$228>>0] = $222;
    $229 = HEAP16[$217>>1]|0;
    $230 = ($229&65535) >>> 8;
    $231 = $230&255;
    $232 = HEAP32[$223>>2]|0;
    $233 = (($232) + 1)|0;
    HEAP32[$223>>2] = $233;
    $234 = HEAP32[$226>>2]|0;
    $235 = (($234) + ($232)|0);
    HEAP8[$235>>0] = $231;
    $236 = HEAP32[$150>>2]|0;
    $237 = (16 - ($236))|0;
    $238 = $215 >>> $237;
    $239 = $238&65535;
    HEAP16[$217>>1] = $239;
    $240 = (($236) + -11)|0;
    $247 = $238;$storemerge23 = $240;
   } else {
    $241 = (($storemerge22) + 5)|0;
    $247 = $220;$storemerge23 = $241;
   }
   HEAP32[$150>>2] = $storemerge23;
   $242 = ($storemerge23|0)>(11);
   $243 = $212 & 65535;
   $244 = $243 << $storemerge23;
   $245 = ((($s)) + 5816|0);
   $246 = $247 & 65535;
   $248 = $246 | $244;
   $249 = $248&65535;
   HEAP16[$245>>1] = $249;
   if ($242) {
    $250 = $248&255;
    $251 = ((($s)) + 20|0);
    $252 = HEAP32[$251>>2]|0;
    $253 = (($252) + 1)|0;
    HEAP32[$251>>2] = $253;
    $254 = ((($s)) + 8|0);
    $255 = HEAP32[$254>>2]|0;
    $256 = (($255) + ($252)|0);
    HEAP8[$256>>0] = $250;
    $257 = HEAP16[$245>>1]|0;
    $258 = ($257&65535) >>> 8;
    $259 = $258&255;
    $260 = HEAP32[$251>>2]|0;
    $261 = (($260) + 1)|0;
    HEAP32[$251>>2] = $261;
    $262 = HEAP32[$254>>2]|0;
    $263 = (($262) + ($260)|0);
    HEAP8[$263>>0] = $259;
    $264 = HEAP32[$150>>2]|0;
    $265 = (16 - ($264))|0;
    $266 = $243 >>> $265;
    $267 = $266&65535;
    HEAP16[$245>>1] = $267;
    $268 = (($264) + -11)|0;
    $276 = $266;$storemerge24 = $268;
   } else {
    $269 = (($storemerge23) + 5)|0;
    $276 = $248;$storemerge24 = $269;
   }
   HEAP32[$150>>2] = $storemerge24;
   $270 = ($storemerge24|0)>(12);
   $271 = (($max_blindex$0) + 65532)|0;
   $272 = $271 & 65535;
   $273 = $272 << $storemerge24;
   $274 = ((($s)) + 5816|0);
   $275 = $276 & 65535;
   $277 = $275 | $273;
   $278 = $277&65535;
   HEAP16[$274>>1] = $278;
   if ($270) {
    $279 = $277&255;
    $280 = ((($s)) + 20|0);
    $281 = HEAP32[$280>>2]|0;
    $282 = (($281) + 1)|0;
    HEAP32[$280>>2] = $282;
    $283 = ((($s)) + 8|0);
    $284 = HEAP32[$283>>2]|0;
    $285 = (($284) + ($281)|0);
    HEAP8[$285>>0] = $279;
    $286 = HEAP16[$274>>1]|0;
    $287 = ($286&65535) >>> 8;
    $288 = $287&255;
    $289 = HEAP32[$280>>2]|0;
    $290 = (($289) + 1)|0;
    HEAP32[$280>>2] = $290;
    $291 = HEAP32[$283>>2]|0;
    $292 = (($291) + ($289)|0);
    HEAP8[$292>>0] = $288;
    $293 = HEAP32[$150>>2]|0;
    $294 = (16 - ($293))|0;
    $295 = $272 >>> $294;
    $296 = $295&65535;
    HEAP16[$274>>1] = $296;
    $297 = (($293) + -12)|0;
    HEAP32[$150>>2] = $297;
    $$pre$phi10Z2D = $283;$$pre$phi8Z2D = $280;$375 = $295;$376 = $297;
   } else {
    $298 = (($storemerge24) + 4)|0;
    HEAP32[$150>>2] = $298;
    $$pre = ((($s)) + 20|0);
    $$pre9 = ((($s)) + 8|0);
    $$pre$phi10Z2D = $$pre9;$$pre$phi8Z2D = $$pre;$375 = $277;$376 = $298;
   }
   $301 = $376;$310 = $375;$rank$0$i = 0;
   while(1) {
    $299 = ($rank$0$i|0)<($max_blindex$0|0);
    if (!($299)) {
     break;
    }
    $300 = ($301|0)>(13);
    $302 = (14597 + ($rank$0$i)|0);
    $303 = HEAP8[$302>>0]|0;
    $304 = $303&255;
    $305 = (((((($s)) + 2684|0) + ($304<<2)|0)) + 2|0);
    $306 = HEAP16[$305>>1]|0;
    $307 = $306&65535;
    $308 = $307 << $301;
    $309 = $310 & 65535;
    $311 = $309 | $308;
    $312 = $311&65535;
    HEAP16[$274>>1] = $312;
    if ($300) {
     $313 = $311&255;
     $314 = HEAP32[$$pre$phi8Z2D>>2]|0;
     $315 = (($314) + 1)|0;
     HEAP32[$$pre$phi8Z2D>>2] = $315;
     $316 = HEAP32[$$pre$phi10Z2D>>2]|0;
     $317 = (($316) + ($314)|0);
     HEAP8[$317>>0] = $313;
     $318 = HEAP16[$274>>1]|0;
     $319 = ($318&65535) >>> 8;
     $320 = $319&255;
     $321 = HEAP32[$$pre$phi8Z2D>>2]|0;
     $322 = (($321) + 1)|0;
     HEAP32[$$pre$phi8Z2D>>2] = $322;
     $323 = HEAP32[$$pre$phi10Z2D>>2]|0;
     $324 = (($323) + ($321)|0);
     HEAP8[$324>>0] = $320;
     $325 = HEAP32[$150>>2]|0;
     $326 = (16 - ($325))|0;
     $327 = $307 >>> $326;
     $328 = $327&65535;
     HEAP16[$274>>1] = $328;
     $329 = (($325) + -13)|0;
     $377 = $327;$storemerge25 = $329;
    } else {
     $330 = (($301) + 3)|0;
     $377 = $311;$storemerge25 = $330;
    }
    HEAP32[$150>>2] = $storemerge25;
    $331 = (($rank$0$i) + 1)|0;
    $301 = $storemerge25;$310 = $377;$rank$0$i = $331;
   }
   $332 = ((($s)) + 148|0);
   _send_tree($s,$332,$210);
   $333 = ((($s)) + 2440|0);
   _send_tree($s,$333,$212);
   _compress_block($s,$332,$333);
   $n$0$i1 = 0;
  } else {
   $62 = ((($s)) + 5820|0);
   $63 = HEAP32[$62>>2]|0;
   $64 = ($63|0)>(13);
   $65 = $last & 65535;
   $66 = $65 << $63;
   $67 = ((($s)) + 5816|0);
   $68 = HEAP16[$67>>1]|0;
   $69 = $68&65535;
   $70 = $69 | $66;
   $71 = $70&65535;
   HEAP16[$67>>1] = $71;
   if ($64) {
    $72 = $70&255;
    $73 = ((($s)) + 20|0);
    $74 = HEAP32[$73>>2]|0;
    $75 = (($74) + 1)|0;
    HEAP32[$73>>2] = $75;
    $76 = ((($s)) + 8|0);
    $77 = HEAP32[$76>>2]|0;
    $78 = (($77) + ($74)|0);
    HEAP8[$78>>0] = $72;
    $79 = HEAP16[$67>>1]|0;
    $80 = ($79&65535) >>> 8;
    $81 = $80&255;
    $82 = HEAP32[$73>>2]|0;
    $83 = (($82) + 1)|0;
    HEAP32[$73>>2] = $83;
    $84 = HEAP32[$76>>2]|0;
    $85 = (($84) + ($82)|0);
    HEAP8[$85>>0] = $81;
    $86 = HEAP32[$62>>2]|0;
    $87 = (16 - ($86))|0;
    $88 = $65 >>> $87;
    $89 = $88&65535;
    HEAP16[$67>>1] = $89;
    $90 = (($86) + -13)|0;
    $$off0$in = $88;$storemerge = $90;
   } else {
    $91 = (($63) + 3)|0;
    $$off0$in = $70;$storemerge = $91;
   }
   $$off0 = $$off0$in&255;
   HEAP32[$62>>2] = $storemerge;
   $92 = ($storemerge|0)>(8);
   do {
    if ($92) {
     $93 = ((($s)) + 5816|0);
     $94 = ((($s)) + 20|0);
     $95 = HEAP32[$94>>2]|0;
     $96 = (($95) + 1)|0;
     HEAP32[$94>>2] = $96;
     $97 = ((($s)) + 8|0);
     $98 = HEAP32[$97>>2]|0;
     $99 = (($98) + ($95)|0);
     HEAP8[$99>>0] = $$off0;
     $100 = HEAP16[$93>>1]|0;
     $101 = ($100&65535) >>> 8;
     $102 = $101&255;
     $103 = HEAP32[$94>>2]|0;
     $104 = (($103) + 1)|0;
     HEAP32[$94>>2] = $104;
     $105 = HEAP32[$97>>2]|0;
     $106 = (($105) + ($103)|0);
     HEAP8[$106>>0] = $102;
     $$pre$phi14Z2D = $93;$$pre$phi16Z2D = $94;$$pre$phi18Z2D = $97;
    } else {
     $107 = ($storemerge|0)>(0);
     $108 = ((($s)) + 5816|0);
     $109 = ((($s)) + 20|0);
     if ($107) {
      $110 = HEAP32[$109>>2]|0;
      $111 = (($110) + 1)|0;
      HEAP32[$109>>2] = $111;
      $112 = ((($s)) + 8|0);
      $113 = HEAP32[$112>>2]|0;
      $114 = (($113) + ($110)|0);
      HEAP8[$114>>0] = $$off0;
      $$pre$phi14Z2D = $108;$$pre$phi16Z2D = $109;$$pre$phi18Z2D = $112;
      break;
     } else {
      $$pre17 = ((($s)) + 8|0);
      $$pre$phi14Z2D = $108;$$pre$phi16Z2D = $109;$$pre$phi18Z2D = $$pre17;
      break;
     }
    }
   } while(0);
   HEAP16[$$pre$phi14Z2D>>1] = 0;
   HEAP32[$62>>2] = 0;
   $115 = $stored_len&255;
   $116 = HEAP32[$$pre$phi16Z2D>>2]|0;
   $117 = (($116) + 1)|0;
   HEAP32[$$pre$phi16Z2D>>2] = $117;
   $118 = HEAP32[$$pre$phi18Z2D>>2]|0;
   $119 = (($118) + ($116)|0);
   HEAP8[$119>>0] = $115;
   $120 = $stored_len >>> 8;
   $121 = $120&255;
   $122 = HEAP32[$$pre$phi16Z2D>>2]|0;
   $123 = (($122) + 1)|0;
   HEAP32[$$pre$phi16Z2D>>2] = $123;
   $124 = HEAP32[$$pre$phi18Z2D>>2]|0;
   $125 = (($124) + ($122)|0);
   HEAP8[$125>>0] = $121;
   $126 = $stored_len ^ 255;
   $127 = $126&255;
   $128 = HEAP32[$$pre$phi16Z2D>>2]|0;
   $129 = (($128) + 1)|0;
   HEAP32[$$pre$phi16Z2D>>2] = $129;
   $130 = HEAP32[$$pre$phi18Z2D>>2]|0;
   $131 = (($130) + ($128)|0);
   HEAP8[$131>>0] = $127;
   $132 = $120 ^ 255;
   $133 = $132&255;
   $134 = HEAP32[$$pre$phi16Z2D>>2]|0;
   $135 = (($134) + 1)|0;
   HEAP32[$$pre$phi16Z2D>>2] = $135;
   $136 = HEAP32[$$pre$phi18Z2D>>2]|0;
   $137 = (($136) + ($134)|0);
   HEAP8[$137>>0] = $133;
   $$0$i$i = $stored_len;$$01$i$i = $buf;
   while(1) {
    $138 = ($$0$i$i|0)==(0);
    if ($138) {
     $n$0$i1 = 0;
     break L27;
    }
    $139 = (($$0$i$i) + -1)|0;
    $140 = ((($$01$i$i)) + 1|0);
    $141 = HEAP8[$$01$i$i>>0]|0;
    $142 = HEAP32[$$pre$phi16Z2D>>2]|0;
    $143 = (($142) + 1)|0;
    HEAP32[$$pre$phi16Z2D>>2] = $143;
    $144 = HEAP32[$$pre$phi18Z2D>>2]|0;
    $145 = (($144) + ($142)|0);
    HEAP8[$145>>0] = $141;
    $$0$i$i = $139;$$01$i$i = $140;
   }
  }
 } while(0);
 while(1) {
  $exitcond20 = ($n$0$i1|0)==(286);
  if ($exitcond20) {
   $n$1$i2 = 0;
   break;
  }
  $334 = (((($s)) + 148|0) + ($n$0$i1<<2)|0);
  HEAP16[$334>>1] = 0;
  $335 = (($n$0$i1) + 1)|0;
  $n$0$i1 = $335;
 }
 while(1) {
  $exitcond19 = ($n$1$i2|0)==(30);
  if ($exitcond19) {
   $n$2$i = 0;
   break;
  }
  $336 = (((($s)) + 2440|0) + ($n$1$i2<<2)|0);
  HEAP16[$336>>1] = 0;
  $337 = (($n$1$i2) + 1)|0;
  $n$1$i2 = $337;
 }
 while(1) {
  $exitcond = ($n$2$i|0)==(19);
  if ($exitcond) {
   break;
  }
  $338 = (((($s)) + 2684|0) + ($n$2$i<<2)|0);
  HEAP16[$338>>1] = 0;
  $339 = (($n$2$i) + 1)|0;
  $n$2$i = $339;
 }
 $340 = ((($s)) + 1172|0);
 HEAP16[$340>>1] = 1;
 $341 = ((($s)) + 5804|0);
 HEAP32[$341>>2] = 0;
 $342 = ((($s)) + 5800|0);
 HEAP32[$342>>2] = 0;
 $343 = ((($s)) + 5808|0);
 HEAP32[$343>>2] = 0;
 $344 = ((($s)) + 5792|0);
 HEAP32[$344>>2] = 0;
 $345 = ($last|0)==(0);
 if ($345) {
  return;
 }
 $346 = ((($s)) + 5820|0);
 $347 = HEAP32[$346>>2]|0;
 $348 = ($347|0)>(8);
 if ($348) {
  $349 = ((($s)) + 5816|0);
  $350 = HEAP16[$349>>1]|0;
  $351 = $350&255;
  $352 = ((($s)) + 20|0);
  $353 = HEAP32[$352>>2]|0;
  $354 = (($353) + 1)|0;
  HEAP32[$352>>2] = $354;
  $355 = ((($s)) + 8|0);
  $356 = HEAP32[$355>>2]|0;
  $357 = (($356) + ($353)|0);
  HEAP8[$357>>0] = $351;
  $358 = HEAP16[$349>>1]|0;
  $359 = ($358&65535) >>> 8;
  $360 = $359&255;
  $361 = HEAP32[$352>>2]|0;
  $362 = (($361) + 1)|0;
  HEAP32[$352>>2] = $362;
  $363 = HEAP32[$355>>2]|0;
  $364 = (($363) + ($361)|0);
  HEAP8[$364>>0] = $360;
  $$pre$phi12Z2D = $349;
 } else {
  $365 = ($347|0)>(0);
  $366 = ((($s)) + 5816|0);
  if ($365) {
   $367 = HEAP16[$366>>1]|0;
   $368 = $367&255;
   $369 = ((($s)) + 20|0);
   $370 = HEAP32[$369>>2]|0;
   $371 = (($370) + 1)|0;
   HEAP32[$369>>2] = $371;
   $372 = ((($s)) + 8|0);
   $373 = HEAP32[$372>>2]|0;
   $374 = (($373) + ($370)|0);
   HEAP8[$374>>0] = $368;
   $$pre$phi12Z2D = $366;
  } else {
   $$pre$phi12Z2D = $366;
  }
 }
 HEAP16[$$pre$phi12Z2D>>1] = 0;
 HEAP32[$346>>2] = 0;
 return;
}
function _build_tree($s,$desc) {
 $s = $s|0;
 $desc = $desc|0;
 var $$ = 0, $$0$i$i = 0, $$01$i$i = 0, $$17 = 0, $$max_code$2 = 0, $$pre = 0, $$sink = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0;
 var $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0;
 var $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0;
 var $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0;
 var $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0;
 var $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0;
 var $20 = 0, $200 = 0, $201 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0;
 var $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0;
 var $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0;
 var $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0;
 var $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $bits$0$i = 0, $bits$0$i1 = 0, $bits$2$i = 0, $bits$2$in$i = 0, $bits$3$i = 0, $code$0$i = 0, $exitcond = 0, $exitcond16 = 0, $h$0$i = 0, $h$0$in$i = 0, $h$1$i = 0;
 var $h$2$i = 0, $h$2$i$ph = 0, $max_code$0 = 0, $max_code$1 = 0, $max_code$2 = 0, $n$0 = 0, $n$0$i$ph = 0, $n$0$i2 = 0, $n$1 = 0, $next_code$i = 0, $node$0 = 0, $overflow$0$i = 0, $overflow$0$i$ = 0, $overflow$2$i = 0, $res$0$i$i = 0, $xbits$0$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $next_code$i = sp;
 $0 = HEAP32[$desc>>2]|0;
 $1 = ((($desc)) + 8|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = HEAP32[$2>>2]|0;
 $4 = ((($2)) + 12|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ((($s)) + 5200|0);
 HEAP32[$6>>2] = 0;
 $7 = ((($s)) + 5204|0);
 HEAP32[$7>>2] = 573;
 $max_code$0 = -1;$n$0 = 0;
 while(1) {
  $8 = ($n$0|0)<($5|0);
  if (!($8)) {
   break;
  }
  $12 = (($0) + ($n$0<<2)|0);
  $13 = HEAP16[$12>>1]|0;
  $14 = ($13<<16>>16)==(0);
  if ($14) {
   $19 = (((($0) + ($n$0<<2)|0)) + 2|0);
   HEAP16[$19>>1] = 0;
   $max_code$1 = $max_code$0;
  } else {
   $15 = HEAP32[$6>>2]|0;
   $16 = (($15) + 1)|0;
   HEAP32[$6>>2] = $16;
   $17 = (((($s)) + 2908|0) + ($16<<2)|0);
   HEAP32[$17>>2] = $n$0;
   $18 = (((($s)) + 5208|0) + ($n$0)|0);
   HEAP8[$18>>0] = 0;
   $max_code$1 = $n$0;
  }
  $20 = (($n$0) + 1)|0;
  $max_code$0 = $max_code$1;$n$0 = $20;
 }
 $9 = ((($s)) + 5800|0);
 $10 = ($3|0)==(0|0);
 $11 = ((($s)) + 5804|0);
 $max_code$2 = $max_code$0;
 while(1) {
  $21 = HEAP32[$6>>2]|0;
  $22 = ($21|0)<(2);
  if (!($22)) {
   break;
  }
  $23 = ($max_code$2|0)<(2);
  $24 = (($max_code$2) + 1)|0;
  $$max_code$2 = $23 ? $24 : $max_code$2;
  $$ = $23 ? $24 : 0;
  $25 = (($21) + 1)|0;
  HEAP32[$6>>2] = $25;
  $26 = (((($s)) + 2908|0) + ($25<<2)|0);
  HEAP32[$26>>2] = $$;
  $27 = (($0) + ($$<<2)|0);
  HEAP16[$27>>1] = 1;
  $28 = (((($s)) + 5208|0) + ($$)|0);
  HEAP8[$28>>0] = 0;
  $29 = HEAP32[$9>>2]|0;
  $30 = (($29) + -1)|0;
  HEAP32[$9>>2] = $30;
  if ($10) {
   $max_code$2 = $$max_code$2;
   continue;
  }
  $31 = (((($3) + ($$<<2)|0)) + 2|0);
  $32 = HEAP16[$31>>1]|0;
  $33 = $32&65535;
  $34 = HEAP32[$11>>2]|0;
  $35 = (($34) - ($33))|0;
  HEAP32[$11>>2] = $35;
  $max_code$2 = $$max_code$2;
 }
 $36 = ((($desc)) + 4|0);
 HEAP32[$36>>2] = $max_code$2;
 $37 = HEAP32[$6>>2]|0;
 $38 = (($37|0) / 2)&-1;
 $n$1 = $38;
 while(1) {
  $39 = ($n$1|0)>(0);
  if (!($39)) {
   break;
  }
  _pqdownheap($s,$0,$n$1);
  $41 = (($n$1) + -1)|0;
  $n$1 = $41;
 }
 $40 = ((($s)) + 2912|0);
 $$pre = HEAP32[$6>>2]|0;
 $44 = $$pre;$node$0 = $5;
 while(1) {
  $42 = HEAP32[$40>>2]|0;
  $43 = (($44) + -1)|0;
  HEAP32[$6>>2] = $43;
  $45 = (((($s)) + 2908|0) + ($44<<2)|0);
  $46 = HEAP32[$45>>2]|0;
  HEAP32[$40>>2] = $46;
  _pqdownheap($s,$0,1);
  $47 = HEAP32[$40>>2]|0;
  $48 = HEAP32[$7>>2]|0;
  $49 = (($48) + -1)|0;
  HEAP32[$7>>2] = $49;
  $50 = (((($s)) + 2908|0) + ($49<<2)|0);
  HEAP32[$50>>2] = $42;
  $51 = HEAP32[$7>>2]|0;
  $52 = (($51) + -1)|0;
  HEAP32[$7>>2] = $52;
  $53 = (((($s)) + 2908|0) + ($52<<2)|0);
  HEAP32[$53>>2] = $47;
  $54 = (($0) + ($42<<2)|0);
  $55 = HEAP16[$54>>1]|0;
  $56 = $55&65535;
  $57 = (($0) + ($47<<2)|0);
  $58 = HEAP16[$57>>1]|0;
  $59 = $58&65535;
  $60 = (($56) + ($59))|0;
  $61 = $60&65535;
  $62 = (($0) + ($node$0<<2)|0);
  HEAP16[$62>>1] = $61;
  $63 = (((($s)) + 5208|0) + ($42)|0);
  $64 = HEAP8[$63>>0]|0;
  $65 = (((($s)) + 5208|0) + ($47)|0);
  $66 = HEAP8[$65>>0]|0;
  $67 = ($64&255)<($66&255);
  $$sink = $67 ? $66 : $64;
  $68 = $$sink&255;
  $69 = (($68) + 1)|0;
  $70 = $69&255;
  $71 = (((($s)) + 5208|0) + ($node$0)|0);
  HEAP8[$71>>0] = $70;
  $72 = $node$0&65535;
  $73 = (((($0) + ($47<<2)|0)) + 2|0);
  HEAP16[$73>>1] = $72;
  $74 = (((($0) + ($42<<2)|0)) + 2|0);
  HEAP16[$74>>1] = $72;
  HEAP32[$40>>2] = $node$0;
  _pqdownheap($s,$0,1);
  $75 = (($node$0) + 1)|0;
  $76 = HEAP32[$6>>2]|0;
  $77 = ($76|0)>(1);
  if ($77) {
   $44 = $76;$node$0 = $75;
  } else {
   break;
  }
 }
 $78 = HEAP32[$40>>2]|0;
 $79 = HEAP32[$7>>2]|0;
 $80 = (($79) + -1)|0;
 HEAP32[$7>>2] = $80;
 $81 = (((($s)) + 2908|0) + ($80<<2)|0);
 HEAP32[$81>>2] = $78;
 $82 = HEAP32[$desc>>2]|0;
 $83 = HEAP32[$36>>2]|0;
 $84 = HEAP32[$1>>2]|0;
 $85 = HEAP32[$84>>2]|0;
 $86 = ((($84)) + 4|0);
 $87 = HEAP32[$86>>2]|0;
 $88 = ((($84)) + 8|0);
 $89 = HEAP32[$88>>2]|0;
 $90 = ((($84)) + 16|0);
 $91 = HEAP32[$90>>2]|0;
 $bits$0$i = 0;
 while(1) {
  $exitcond16 = ($bits$0$i|0)==(16);
  if ($exitcond16) {
   break;
  }
  $92 = (((($s)) + 2876|0) + ($bits$0$i<<1)|0);
  HEAP16[$92>>1] = 0;
  $93 = (($bits$0$i) + 1)|0;
  $bits$0$i = $93;
 }
 $94 = HEAP32[$7>>2]|0;
 $95 = (((($s)) + 2908|0) + ($94<<2)|0);
 $96 = HEAP32[$95>>2]|0;
 $97 = (((($82) + ($96<<2)|0)) + 2|0);
 HEAP16[$97>>1] = 0;
 $98 = HEAP32[$7>>2]|0;
 $99 = ($85|0)==(0|0);
 $h$0$in$i = $98;$overflow$0$i = 0;
 while(1) {
  $h$0$i = (($h$0$in$i) + 1)|0;
  $100 = ($h$0$i|0)<(573);
  if (!($100)) {
   break;
  }
  $101 = (((($s)) + 2908|0) + ($h$0$i<<2)|0);
  $102 = HEAP32[$101>>2]|0;
  $103 = (((($82) + ($102<<2)|0)) + 2|0);
  $104 = HEAP16[$103>>1]|0;
  $105 = $104&65535;
  $106 = (((($82) + ($105<<2)|0)) + 2|0);
  $107 = HEAP16[$106>>1]|0;
  $108 = $107&65535;
  $109 = (($108) + 1)|0;
  $110 = ($108|0)<($91|0);
  $$17 = $110 ? $109 : $91;
  $111 = $110&1;
  $112 = $111 ^ 1;
  $overflow$0$i$ = (($overflow$0$i) + ($112))|0;
  $113 = $$17&65535;
  HEAP16[$103>>1] = $113;
  $114 = ($102|0)>($83|0);
  if ($114) {
   $h$0$in$i = $h$0$i;$overflow$0$i = $overflow$0$i$;
   continue;
  }
  $115 = (((($s)) + 2876|0) + ($$17<<1)|0);
  $116 = HEAP16[$115>>1]|0;
  $117 = (($116) + 1)<<16>>16;
  HEAP16[$115>>1] = $117;
  $118 = ($102|0)<($89|0);
  if ($118) {
   $xbits$0$i = 0;
  } else {
   $119 = (($102) - ($89))|0;
   $120 = (($87) + ($119<<2)|0);
   $121 = HEAP32[$120>>2]|0;
   $xbits$0$i = $121;
  }
  $122 = (($82) + ($102<<2)|0);
  $123 = HEAP16[$122>>1]|0;
  $124 = $123&65535;
  $125 = (($$17) + ($xbits$0$i))|0;
  $126 = Math_imul($124, $125)|0;
  $127 = HEAP32[$9>>2]|0;
  $128 = (($127) + ($126))|0;
  HEAP32[$9>>2] = $128;
  if ($99) {
   $h$0$in$i = $h$0$i;$overflow$0$i = $overflow$0$i$;
   continue;
  }
  $129 = (((($85) + ($102<<2)|0)) + 2|0);
  $130 = HEAP16[$129>>1]|0;
  $131 = $130&65535;
  $132 = (($131) + ($xbits$0$i))|0;
  $133 = Math_imul($124, $132)|0;
  $134 = HEAP32[$11>>2]|0;
  $135 = (($134) + ($133))|0;
  HEAP32[$11>>2] = $135;
  $h$0$in$i = $h$0$i;$overflow$0$i = $overflow$0$i$;
 }
 $136 = ($overflow$0$i|0)==(0);
 L34: do {
  if (!($136)) {
   $137 = (((($s)) + 2876|0) + ($91<<1)|0);
   $overflow$2$i = $overflow$0$i;
   while(1) {
    $bits$2$in$i = $91;
    while(1) {
     $bits$2$i = (($bits$2$in$i) + -1)|0;
     $138 = (((($s)) + 2876|0) + ($bits$2$i<<1)|0);
     $139 = HEAP16[$138>>1]|0;
     $140 = ($139<<16>>16)==(0);
     if ($140) {
      $bits$2$in$i = $bits$2$i;
     } else {
      break;
     }
    }
    $141 = (($139) + -1)<<16>>16;
    HEAP16[$138>>1] = $141;
    $142 = (((($s)) + 2876|0) + ($bits$2$in$i<<1)|0);
    $143 = HEAP16[$142>>1]|0;
    $144 = $143&65535;
    $145 = (($144) + 2)|0;
    $146 = $145&65535;
    HEAP16[$142>>1] = $146;
    $147 = HEAP16[$137>>1]|0;
    $148 = (($147) + -1)<<16>>16;
    HEAP16[$137>>1] = $148;
    $149 = (($overflow$2$i) + -2)|0;
    $150 = ($overflow$2$i|0)>(2);
    if ($150) {
     $overflow$2$i = $149;
    } else {
     $bits$3$i = $91;$h$1$i = $h$0$i;
     break;
    }
   }
   while(1) {
    $151 = ($bits$3$i|0)==(0);
    if ($151) {
     break L34;
    }
    $152 = (((($s)) + 2876|0) + ($bits$3$i<<1)|0);
    $153 = HEAP16[$152>>1]|0;
    $154 = $153&65535;
    $155 = $bits$3$i&65535;
    $h$2$i$ph = $h$1$i;$n$0$i$ph = $154;
    L44: while(1) {
     $156 = ($n$0$i$ph|0)==(0);
     $h$2$i = $h$2$i$ph;
     while(1) {
      if ($156) {
       break L44;
      }
      $157 = (($h$2$i) + -1)|0;
      $158 = (((($s)) + 2908|0) + ($157<<2)|0);
      $159 = HEAP32[$158>>2]|0;
      $160 = ($159|0)>($83|0);
      if ($160) {
       $h$2$i = $157;
      } else {
       break;
      }
     }
     $161 = (((($82) + ($159<<2)|0)) + 2|0);
     $162 = HEAP16[$161>>1]|0;
     $163 = $162&65535;
     $164 = ($bits$3$i|0)==($163|0);
     if (!($164)) {
      $165 = (($bits$3$i) - ($163))|0;
      $166 = (($82) + ($159<<2)|0);
      $167 = HEAP16[$166>>1]|0;
      $168 = $167&65535;
      $169 = Math_imul($165, $168)|0;
      $170 = HEAP32[$9>>2]|0;
      $171 = (($170) + ($169))|0;
      HEAP32[$9>>2] = $171;
      HEAP16[$161>>1] = $155;
     }
     $172 = (($n$0$i$ph) + -1)|0;
     $h$2$i$ph = $157;$n$0$i$ph = $172;
    }
    $173 = (($bits$3$i) + -1)|0;
    $bits$3$i = $173;$h$1$i = $h$2$i;
   }
  }
 } while(0);
 $bits$0$i1 = 1;$code$0$i = 0;
 while(1) {
  $exitcond = ($bits$0$i1|0)==(16);
  if ($exitcond) {
   $n$0$i2 = 0;
   break;
  }
  $174 = $code$0$i & 65534;
  $175 = (($bits$0$i1) + -1)|0;
  $176 = (((($s)) + 2876|0) + ($175<<1)|0);
  $177 = HEAP16[$176>>1]|0;
  $178 = $177&65535;
  $179 = (($174) + ($178))|0;
  $180 = $179 << 1;
  $181 = $180&65535;
  $182 = (($next_code$i) + ($bits$0$i1<<1)|0);
  HEAP16[$182>>1] = $181;
  $183 = (($bits$0$i1) + 1)|0;
  $bits$0$i1 = $183;$code$0$i = $180;
 }
 while(1) {
  $184 = ($n$0$i2|0)>($max_code$2|0);
  if ($184) {
   break;
  }
  $185 = (((($0) + ($n$0$i2<<2)|0)) + 2|0);
  $186 = HEAP16[$185>>1]|0;
  $187 = $186&65535;
  $188 = ($186<<16>>16)==(0);
  if (!($188)) {
   $189 = (($next_code$i) + ($187<<1)|0);
   $190 = HEAP16[$189>>1]|0;
   $191 = (($190) + 1)<<16>>16;
   HEAP16[$189>>1] = $191;
   $192 = $190&65535;
   $$0$i$i = $192;$$01$i$i = $187;$res$0$i$i = 0;
   while(1) {
    $193 = $$0$i$i & 1;
    $194 = $res$0$i$i | $193;
    $195 = $194 << 1;
    $196 = $$0$i$i >>> 1;
    $197 = (($$01$i$i) + -1)|0;
    $198 = ($$01$i$i|0)>(1);
    if ($198) {
     $$0$i$i = $196;$$01$i$i = $197;$res$0$i$i = $195;
    } else {
     break;
    }
   }
   $199 = $194&65535;
   $200 = (($0) + ($n$0$i2<<2)|0);
   HEAP16[$200>>1] = $199;
  }
  $201 = (($n$0$i2) + 1)|0;
  $n$0$i2 = $201;
 }
 STACKTOP = sp;return;
}
function _pqdownheap($s,$tree,$k) {
 $s = $s|0;
 $tree = $tree|0;
 $k = $k|0;
 var $$0 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $j$0 = 0, $j$1 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (((($s)) + 2908|0) + ($k<<2)|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = (((($s)) + 5208|0) + ($1)|0);
 $3 = ((($s)) + 5200|0);
 $4 = (($tree) + ($1<<2)|0);
 $$0 = $k;
 while(1) {
  $j$0 = $$0 << 1;
  $5 = HEAP32[$3>>2]|0;
  $6 = ($j$0|0)>($5|0);
  if ($6) {
   label = 12;
   break;
  }
  $7 = ($j$0|0)<($5|0);
  do {
   if ($7) {
    $8 = $j$0 | 1;
    $9 = (((($s)) + 2908|0) + ($8<<2)|0);
    $10 = HEAP32[$9>>2]|0;
    $11 = (($tree) + ($10<<2)|0);
    $12 = HEAP16[$11>>1]|0;
    $13 = (((($s)) + 2908|0) + ($j$0<<2)|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = (($tree) + ($14<<2)|0);
    $16 = HEAP16[$15>>1]|0;
    $17 = ($12&65535)<($16&65535);
    if (!($17)) {
     $18 = ($12<<16>>16)==($16<<16>>16);
     if (!($18)) {
      $j$1 = $j$0;
      break;
     }
     $19 = (((($s)) + 5208|0) + ($10)|0);
     $20 = HEAP8[$19>>0]|0;
     $21 = (((($s)) + 5208|0) + ($14)|0);
     $22 = HEAP8[$21>>0]|0;
     $23 = ($20&255)>($22&255);
     if ($23) {
      $j$1 = $j$0;
      break;
     }
    }
    $j$1 = $8;
   } else {
    $j$1 = $j$0;
   }
  } while(0);
  $24 = HEAP16[$4>>1]|0;
  $25 = (((($s)) + 2908|0) + ($j$1<<2)|0);
  $26 = HEAP32[$25>>2]|0;
  $27 = (($tree) + ($26<<2)|0);
  $28 = HEAP16[$27>>1]|0;
  $29 = ($24&65535)<($28&65535);
  if ($29) {
   label = 12;
   break;
  }
  $30 = ($24<<16>>16)==($28<<16>>16);
  if ($30) {
   $31 = HEAP8[$2>>0]|0;
   $32 = (((($s)) + 5208|0) + ($26)|0);
   $33 = HEAP8[$32>>0]|0;
   $34 = ($31&255)>($33&255);
   if (!($34)) {
    label = 12;
    break;
   }
  }
  $35 = (((($s)) + 2908|0) + ($$0<<2)|0);
  HEAP32[$35>>2] = $26;
  $$0 = $j$1;
 }
 if ((label|0) == 12) {
  $36 = (((($s)) + 2908|0) + ($$0<<2)|0);
  HEAP32[$36>>2] = $1;
  return;
 }
}
function _scan_tree($s,$tree,$max_code) {
 $s = $s|0;
 $tree = $tree|0;
 $max_code = $max_code|0;
 var $$ = 0, $$1 = 0, $$2 = 0, $$3 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $count$0 = 0, $max_count$1 = 0, $max_count$1$phi = 0, $min_count$1 = 0, $min_count$1$phi = 0, $n$0 = 0, $nextlen$0 = 0, $or$cond = 0, $prevlen$0 = 0, $prevlen$0$phi = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($tree)) + 2|0);
 $1 = HEAP16[$0>>1]|0;
 $2 = $1&65535;
 $3 = ($1<<16>>16)==(0);
 $$ = $3 ? 138 : 7;
 $$1 = $3 ? 3 : 4;
 $4 = (($max_code) + 1)|0;
 $5 = (((($tree) + ($4<<2)|0)) + 2|0);
 HEAP16[$5>>1] = -1;
 $6 = ((($s)) + 2752|0);
 $7 = ((($s)) + 2756|0);
 $8 = ((($s)) + 2748|0);
 $count$0 = 0;$max_count$1 = $$;$min_count$1 = $$1;$n$0 = 0;$nextlen$0 = $2;$prevlen$0 = -1;
 while(1) {
  $9 = ($n$0|0)>($max_code|0);
  if ($9) {
   break;
  }
  $10 = (($n$0) + 1)|0;
  $11 = (((($tree) + ($10<<2)|0)) + 2|0);
  $12 = HEAP16[$11>>1]|0;
  $13 = $12&65535;
  $14 = (($count$0) + 1)|0;
  $15 = ($14|0)<($max_count$1|0);
  $16 = ($nextlen$0|0)==($13|0);
  $or$cond = $15 & $16;
  if ($or$cond) {
   $prevlen$0$phi = $prevlen$0;$min_count$1$phi = $min_count$1;$max_count$1$phi = $max_count$1;$count$0 = $14;$n$0 = $10;$nextlen$0 = $13;$prevlen$0 = $prevlen$0$phi;$min_count$1 = $min_count$1$phi;$max_count$1 = $max_count$1$phi;
   continue;
  }
  $17 = ($14|0)<($min_count$1|0);
  do {
   if ($17) {
    $18 = (((($s)) + 2684|0) + ($nextlen$0<<2)|0);
    $19 = HEAP16[$18>>1]|0;
    $20 = $19&65535;
    $21 = (($20) + ($14))|0;
    $22 = $21&65535;
    HEAP16[$18>>1] = $22;
   } else {
    $23 = ($nextlen$0|0)==(0);
    if ($23) {
     $30 = ($14|0)<(11);
     if ($30) {
      $31 = HEAP16[$6>>1]|0;
      $32 = (($31) + 1)<<16>>16;
      HEAP16[$6>>1] = $32;
      break;
     } else {
      $33 = HEAP16[$7>>1]|0;
      $34 = (($33) + 1)<<16>>16;
      HEAP16[$7>>1] = $34;
      break;
     }
    } else {
     $24 = ($nextlen$0|0)==($prevlen$0|0);
     if (!($24)) {
      $25 = (((($s)) + 2684|0) + ($nextlen$0<<2)|0);
      $26 = HEAP16[$25>>1]|0;
      $27 = (($26) + 1)<<16>>16;
      HEAP16[$25>>1] = $27;
     }
     $28 = HEAP16[$8>>1]|0;
     $29 = (($28) + 1)<<16>>16;
     HEAP16[$8>>1] = $29;
     break;
    }
   }
  } while(0);
  $35 = ($12<<16>>16)==(0);
  if ($35) {
   $prevlen$0$phi = $nextlen$0;$count$0 = 0;$max_count$1 = 138;$min_count$1 = 3;$n$0 = $10;$nextlen$0 = $13;$prevlen$0 = $prevlen$0$phi;
   continue;
  }
  $36 = ($nextlen$0|0)==($13|0);
  $$2 = $36 ? 6 : 7;
  $$3 = $36 ? 3 : 4;
  $prevlen$0$phi = $nextlen$0;$count$0 = 0;$max_count$1 = $$2;$min_count$1 = $$3;$n$0 = $10;$nextlen$0 = $13;$prevlen$0 = $prevlen$0$phi;
 }
 return;
}
function _compress_block($s,$ltree,$dtree) {
 $s = $s|0;
 $ltree = $ltree|0;
 $dtree = $dtree|0;
 var $$phi$trans$insert = 0, $$pn = 0, $$pre = 0, $$pre$phiZ2D = 0, $$sink = 0, $$sink$in = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0;
 var $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0;
 var $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0;
 var $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0;
 var $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0;
 var $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0;
 var $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0;
 var $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0;
 var $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0;
 var $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0;
 var $99 = 0, $lx$0 = 0, $storemerge = 0, $storemerge1 = 0, $storemerge2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($s)) + 5792|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0);
 if ($2) {
  $$phi$trans$insert = ((($s)) + 5820|0);
  $$pre = HEAP32[$$phi$trans$insert>>2]|0;
  $$pre$phiZ2D = $$phi$trans$insert;$203 = $$pre;
 } else {
  $3 = ((($s)) + 5796|0);
  $4 = ((($s)) + 5784|0);
  $5 = ((($s)) + 5820|0);
  $6 = ((($s)) + 5816|0);
  $7 = ((($s)) + 20|0);
  $8 = ((($s)) + 8|0);
  $lx$0 = 0;
  while(1) {
   $9 = HEAP32[$3>>2]|0;
   $10 = (($9) + ($lx$0<<1)|0);
   $11 = HEAP16[$10>>1]|0;
   $12 = $11&65535;
   $13 = (($lx$0) + 1)|0;
   $14 = HEAP32[$4>>2]|0;
   $15 = (($14) + ($lx$0)|0);
   $16 = HEAP8[$15>>0]|0;
   $17 = $16&255;
   $18 = ($11<<16>>16)==(0);
   do {
    if ($18) {
     $19 = (((($ltree) + ($17<<2)|0)) + 2|0);
     $20 = HEAP16[$19>>1]|0;
     $21 = $20&65535;
     $22 = HEAP32[$5>>2]|0;
     $23 = (16 - ($21))|0;
     $24 = ($22|0)>($23|0);
     $25 = (($ltree) + ($17<<2)|0);
     $26 = HEAP16[$25>>1]|0;
     $27 = $26&65535;
     $28 = $27 << $22;
     $29 = HEAP16[$6>>1]|0;
     $30 = $29&65535;
     $31 = $30 | $28;
     $32 = $31&65535;
     HEAP16[$6>>1] = $32;
     if ($24) {
      $33 = $31&255;
      $34 = HEAP32[$7>>2]|0;
      $35 = (($34) + 1)|0;
      HEAP32[$7>>2] = $35;
      $36 = HEAP32[$8>>2]|0;
      $37 = (($36) + ($34)|0);
      HEAP8[$37>>0] = $33;
      $38 = HEAP16[$6>>1]|0;
      $39 = ($38&65535) >>> 8;
      $40 = $39&255;
      $41 = HEAP32[$7>>2]|0;
      $42 = (($41) + 1)|0;
      HEAP32[$7>>2] = $42;
      $43 = HEAP32[$8>>2]|0;
      $44 = (($43) + ($41)|0);
      HEAP8[$44>>0] = $40;
      $45 = HEAP32[$5>>2]|0;
      $46 = (16 - ($45))|0;
      $47 = $27 >>> $46;
      $48 = $47&65535;
      HEAP16[$6>>1] = $48;
      $49 = (($21) + -16)|0;
      $50 = (($45) + ($49))|0;
      HEAP32[$5>>2] = $50;
      $234 = $50;
      break;
     } else {
      $51 = (($22) + ($21))|0;
      HEAP32[$5>>2] = $51;
      $234 = $51;
      break;
     }
    } else {
     $52 = (14341 + ($17)|0);
     $53 = HEAP8[$52>>0]|0;
     $54 = $53&255;
     $55 = $54 | 256;
     $56 = (($55) + 1)|0;
     $57 = (((($ltree) + ($56<<2)|0)) + 2|0);
     $58 = HEAP16[$57>>1]|0;
     $59 = $58&65535;
     $60 = HEAP32[$5>>2]|0;
     $61 = (16 - ($59))|0;
     $62 = ($60|0)>($61|0);
     $63 = (($ltree) + ($56<<2)|0);
     $64 = HEAP16[$63>>1]|0;
     $65 = $64&65535;
     $66 = $65 << $60;
     $67 = HEAP16[$6>>1]|0;
     $68 = $67&65535;
     $69 = $68 | $66;
     $70 = $69&65535;
     HEAP16[$6>>1] = $70;
     if ($62) {
      $71 = $69&255;
      $72 = HEAP32[$7>>2]|0;
      $73 = (($72) + 1)|0;
      HEAP32[$7>>2] = $73;
      $74 = HEAP32[$8>>2]|0;
      $75 = (($74) + ($72)|0);
      HEAP8[$75>>0] = $71;
      $76 = HEAP16[$6>>1]|0;
      $77 = ($76&65535) >>> 8;
      $78 = $77&255;
      $79 = HEAP32[$7>>2]|0;
      $80 = (($79) + 1)|0;
      HEAP32[$7>>2] = $80;
      $81 = HEAP32[$8>>2]|0;
      $82 = (($81) + ($79)|0);
      HEAP8[$82>>0] = $78;
      $83 = HEAP32[$5>>2]|0;
      $84 = (16 - ($83))|0;
      $85 = $65 >>> $84;
      $86 = $85&65535;
      HEAP16[$6>>1] = $86;
      $87 = (($59) + -16)|0;
      $88 = (($83) + ($87))|0;
      $102 = $86;$storemerge = $88;
     } else {
      $89 = (($60) + ($59))|0;
      $102 = $70;$storemerge = $89;
     }
     HEAP32[$5>>2] = $storemerge;
     $90 = (8472 + ($54<<2)|0);
     $91 = HEAP32[$90>>2]|0;
     $92 = (($54) + -8)|0;
     $93 = ($92>>>0)<(20);
     do {
      if ($93) {
       $94 = (8824 + ($54<<2)|0);
       $95 = HEAP32[$94>>2]|0;
       $96 = (($17) - ($95))|0;
       $97 = (16 - ($91))|0;
       $98 = ($storemerge|0)>($97|0);
       $99 = $96 & 65535;
       $100 = $99 << $storemerge;
       $101 = $102&65535;
       $103 = $101 | $100;
       $104 = $103&65535;
       HEAP16[$6>>1] = $104;
       if ($98) {
        $105 = $103&255;
        $106 = HEAP32[$7>>2]|0;
        $107 = (($106) + 1)|0;
        HEAP32[$7>>2] = $107;
        $108 = HEAP32[$8>>2]|0;
        $109 = (($108) + ($106)|0);
        HEAP8[$109>>0] = $105;
        $110 = HEAP16[$6>>1]|0;
        $111 = ($110&65535) >>> 8;
        $112 = $111&255;
        $113 = HEAP32[$7>>2]|0;
        $114 = (($113) + 1)|0;
        HEAP32[$7>>2] = $114;
        $115 = HEAP32[$8>>2]|0;
        $116 = (($115) + ($113)|0);
        HEAP8[$116>>0] = $112;
        $117 = HEAP32[$5>>2]|0;
        $118 = (16 - ($117))|0;
        $119 = $99 >>> $118;
        $120 = $119&65535;
        HEAP16[$6>>1] = $120;
        $121 = (($91) + -16)|0;
        $122 = (($117) + ($121))|0;
        HEAP32[$5>>2] = $122;
        $134 = $122;$140 = $120;
        break;
       } else {
        $123 = (($storemerge) + ($91))|0;
        HEAP32[$5>>2] = $123;
        $134 = $123;$140 = $104;
        break;
       }
      } else {
       $134 = $storemerge;$140 = $102;
      }
     } while(0);
     $124 = (($12) + -1)|0;
     $125 = ($124>>>0)<(256);
     $126 = $124 >>> 7;
     $127 = (($126) + 256)|0;
     $$pn = $125 ? $124 : $127;
     $$sink$in = (13829 + ($$pn)|0);
     $$sink = HEAP8[$$sink$in>>0]|0;
     $128 = $$sink&255;
     $129 = (((($dtree) + ($128<<2)|0)) + 2|0);
     $130 = HEAP16[$129>>1]|0;
     $131 = $130&65535;
     $132 = (16 - ($131))|0;
     $133 = ($134|0)>($132|0);
     $135 = (($dtree) + ($128<<2)|0);
     $136 = HEAP16[$135>>1]|0;
     $137 = $136&65535;
     $138 = $137 << $134;
     $139 = $140&65535;
     $141 = $139 | $138;
     $142 = $141&65535;
     HEAP16[$6>>1] = $142;
     if ($133) {
      $143 = $141&255;
      $144 = HEAP32[$7>>2]|0;
      $145 = (($144) + 1)|0;
      HEAP32[$7>>2] = $145;
      $146 = HEAP32[$8>>2]|0;
      $147 = (($146) + ($144)|0);
      HEAP8[$147>>0] = $143;
      $148 = HEAP16[$6>>1]|0;
      $149 = ($148&65535) >>> 8;
      $150 = $149&255;
      $151 = HEAP32[$7>>2]|0;
      $152 = (($151) + 1)|0;
      HEAP32[$7>>2] = $152;
      $153 = HEAP32[$8>>2]|0;
      $154 = (($153) + ($151)|0);
      HEAP8[$154>>0] = $150;
      $155 = HEAP32[$5>>2]|0;
      $156 = (16 - ($155))|0;
      $157 = $137 >>> $156;
      $158 = $157&65535;
      HEAP16[$6>>1] = $158;
      $159 = (($131) + -16)|0;
      $160 = (($155) + ($159))|0;
      $174 = $157;$storemerge1 = $160;
     } else {
      $161 = (($134) + ($131))|0;
      $174 = $141;$storemerge1 = $161;
     }
     HEAP32[$5>>2] = $storemerge1;
     $162 = (8608 + ($128<<2)|0);
     $163 = HEAP32[$162>>2]|0;
     $164 = (($128) + -4)|0;
     $165 = ($164>>>0)<(26);
     if ($165) {
      $166 = (8940 + ($128<<2)|0);
      $167 = HEAP32[$166>>2]|0;
      $168 = (($124) - ($167))|0;
      $169 = (16 - ($163))|0;
      $170 = ($storemerge1|0)>($169|0);
      $171 = $168 & 65535;
      $172 = $171 << $storemerge1;
      $173 = $174 & 65535;
      $175 = $173 | $172;
      $176 = $175&65535;
      HEAP16[$6>>1] = $176;
      if ($170) {
       $177 = $175&255;
       $178 = HEAP32[$7>>2]|0;
       $179 = (($178) + 1)|0;
       HEAP32[$7>>2] = $179;
       $180 = HEAP32[$8>>2]|0;
       $181 = (($180) + ($178)|0);
       HEAP8[$181>>0] = $177;
       $182 = HEAP16[$6>>1]|0;
       $183 = ($182&65535) >>> 8;
       $184 = $183&255;
       $185 = HEAP32[$7>>2]|0;
       $186 = (($185) + 1)|0;
       HEAP32[$7>>2] = $186;
       $187 = HEAP32[$8>>2]|0;
       $188 = (($187) + ($185)|0);
       HEAP8[$188>>0] = $184;
       $189 = HEAP32[$5>>2]|0;
       $190 = (16 - ($189))|0;
       $191 = $171 >>> $190;
       $192 = $191&65535;
       HEAP16[$6>>1] = $192;
       $193 = (($163) + -16)|0;
       $194 = (($189) + ($193))|0;
       HEAP32[$5>>2] = $194;
       $234 = $194;
       break;
      } else {
       $195 = (($storemerge1) + ($163))|0;
       HEAP32[$5>>2] = $195;
       $234 = $195;
       break;
      }
     } else {
      $234 = $storemerge1;
     }
    }
   } while(0);
   $196 = HEAP32[$0>>2]|0;
   $197 = ($13>>>0)<($196>>>0);
   if ($197) {
    $lx$0 = $13;
   } else {
    $$pre$phiZ2D = $5;$203 = $234;
    break;
   }
  }
 }
 $198 = ((($ltree)) + 1026|0);
 $199 = HEAP16[$198>>1]|0;
 $200 = $199&65535;
 $201 = (16 - ($200))|0;
 $202 = ($203|0)>($201|0);
 $204 = ((($ltree)) + 1024|0);
 $205 = HEAP16[$204>>1]|0;
 $206 = $205&65535;
 $207 = $206 << $203;
 $208 = ((($s)) + 5816|0);
 $209 = HEAP16[$208>>1]|0;
 $210 = $209&65535;
 $211 = $210 | $207;
 $212 = $211&65535;
 HEAP16[$208>>1] = $212;
 if ($202) {
  $213 = $211&255;
  $214 = ((($s)) + 20|0);
  $215 = HEAP32[$214>>2]|0;
  $216 = (($215) + 1)|0;
  HEAP32[$214>>2] = $216;
  $217 = ((($s)) + 8|0);
  $218 = HEAP32[$217>>2]|0;
  $219 = (($218) + ($215)|0);
  HEAP8[$219>>0] = $213;
  $220 = HEAP16[$208>>1]|0;
  $221 = ($220&65535) >>> 8;
  $222 = $221&255;
  $223 = HEAP32[$214>>2]|0;
  $224 = (($223) + 1)|0;
  HEAP32[$214>>2] = $224;
  $225 = HEAP32[$217>>2]|0;
  $226 = (($225) + ($223)|0);
  HEAP8[$226>>0] = $222;
  $227 = HEAP32[$$pre$phiZ2D>>2]|0;
  $228 = (16 - ($227))|0;
  $229 = $206 >>> $228;
  $230 = $229&65535;
  HEAP16[$208>>1] = $230;
  $231 = (($200) + -16)|0;
  $232 = (($227) + ($231))|0;
  $storemerge2 = $232;
  HEAP32[$$pre$phiZ2D>>2] = $storemerge2;
  return;
 } else {
  $233 = (($203) + ($200))|0;
  $storemerge2 = $233;
  HEAP32[$$pre$phiZ2D>>2] = $storemerge2;
  return;
 }
}
function _send_tree($s,$tree,$max_code) {
 $s = $s|0;
 $tree = $tree|0;
 $max_code = $max_code|0;
 var $$ = 0, $$6 = 0, $$7 = 0, $$8 = 0, $$pre = 0, $$pre2 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0;
 var $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0;
 var $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0;
 var $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0;
 var $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0;
 var $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0;
 var $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0;
 var $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0;
 var $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0;
 var $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0;
 var $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0;
 var $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0;
 var $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0;
 var $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $count$0 = 0, $count$1 = 0, $count$2 = 0, $max_count$1 = 0, $max_count$1$phi = 0, $min_count$1 = 0, $min_count$1$phi = 0;
 var $n$0 = 0, $nextlen$0 = 0, $or$cond = 0, $prevlen$0 = 0, $prevlen$0$phi = 0, $storemerge = 0, $storemerge3 = 0, $storemerge4 = 0, $storemerge5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($tree)) + 2|0);
 $1 = HEAP16[$0>>1]|0;
 $2 = $1&65535;
 $3 = ($1<<16>>16)==(0);
 $$ = $3 ? 138 : 7;
 $$6 = $3 ? 3 : 4;
 $4 = ((($s)) + 2754|0);
 $5 = ((($s)) + 5820|0);
 $6 = ((($s)) + 2752|0);
 $7 = ((($s)) + 5816|0);
 $8 = ((($s)) + 20|0);
 $9 = ((($s)) + 8|0);
 $10 = ((($s)) + 2758|0);
 $11 = ((($s)) + 2756|0);
 $12 = ((($s)) + 2750|0);
 $13 = ((($s)) + 2748|0);
 $count$0 = 0;$max_count$1 = $$;$min_count$1 = $$6;$n$0 = 0;$nextlen$0 = $2;$prevlen$0 = -1;
 while(1) {
  $14 = ($n$0|0)>($max_code|0);
  if ($14) {
   break;
  }
  $15 = (($n$0) + 1)|0;
  $16 = (((($tree) + ($15<<2)|0)) + 2|0);
  $17 = HEAP16[$16>>1]|0;
  $18 = $17&65535;
  $19 = (($count$0) + 1)|0;
  $20 = ($19|0)<($max_count$1|0);
  $21 = ($nextlen$0|0)==($18|0);
  $or$cond = $20 & $21;
  if ($or$cond) {
   $prevlen$0$phi = $prevlen$0;$min_count$1$phi = $min_count$1;$max_count$1$phi = $max_count$1;$count$0 = $19;$n$0 = $15;$nextlen$0 = $18;$prevlen$0 = $prevlen$0$phi;$min_count$1 = $min_count$1$phi;$max_count$1 = $max_count$1$phi;
   continue;
  }
  $22 = ($19|0)<($min_count$1|0);
  do {
   if ($22) {
    $23 = (((((($s)) + 2684|0) + ($nextlen$0<<2)|0)) + 2|0);
    $24 = (((($s)) + 2684|0) + ($nextlen$0<<2)|0);
    $$pre2 = HEAP32[$5>>2]|0;
    $29 = $$pre2;$count$1 = $19;
    while(1) {
     $25 = HEAP16[$23>>1]|0;
     $26 = $25&65535;
     $27 = (16 - ($26))|0;
     $28 = ($29|0)>($27|0);
     $30 = HEAP16[$24>>1]|0;
     $31 = $30&65535;
     $32 = $31 << $29;
     $33 = HEAP16[$7>>1]|0;
     $34 = $33&65535;
     $35 = $34 | $32;
     $36 = $35&65535;
     HEAP16[$7>>1] = $36;
     if ($28) {
      $37 = $35&255;
      $38 = HEAP32[$8>>2]|0;
      $39 = (($38) + 1)|0;
      HEAP32[$8>>2] = $39;
      $40 = HEAP32[$9>>2]|0;
      $41 = (($40) + ($38)|0);
      HEAP8[$41>>0] = $37;
      $42 = HEAP16[$7>>1]|0;
      $43 = ($42&65535) >>> 8;
      $44 = $43&255;
      $45 = HEAP32[$8>>2]|0;
      $46 = (($45) + 1)|0;
      HEAP32[$8>>2] = $46;
      $47 = HEAP32[$9>>2]|0;
      $48 = (($47) + ($45)|0);
      HEAP8[$48>>0] = $44;
      $49 = HEAP32[$5>>2]|0;
      $50 = (16 - ($49))|0;
      $51 = $31 >>> $50;
      $52 = $51&65535;
      HEAP16[$7>>1] = $52;
      $53 = (($26) + -16)|0;
      $54 = (($49) + ($53))|0;
      $storemerge5 = $54;
     } else {
      $55 = (($29) + ($26))|0;
      $storemerge5 = $55;
     }
     HEAP32[$5>>2] = $storemerge5;
     $56 = (($count$1) + -1)|0;
     $57 = ($56|0)==(0);
     if ($57) {
      break;
     } else {
      $29 = $storemerge5;$count$1 = $56;
     }
    }
   } else {
    $58 = ($nextlen$0|0)==(0);
    if (!($58)) {
     $59 = ($nextlen$0|0)==($prevlen$0|0);
     do {
      if ($59) {
       $$pre = HEAP32[$5>>2]|0;
       $97 = $$pre;$count$2 = $19;
      } else {
       $60 = (((((($s)) + 2684|0) + ($nextlen$0<<2)|0)) + 2|0);
       $61 = HEAP16[$60>>1]|0;
       $62 = $61&65535;
       $63 = HEAP32[$5>>2]|0;
       $64 = (16 - ($62))|0;
       $65 = ($63|0)>($64|0);
       $66 = (((($s)) + 2684|0) + ($nextlen$0<<2)|0);
       $67 = HEAP16[$66>>1]|0;
       $68 = $67&65535;
       $69 = $68 << $63;
       $70 = HEAP16[$7>>1]|0;
       $71 = $70&65535;
       $72 = $71 | $69;
       $73 = $72&65535;
       HEAP16[$7>>1] = $73;
       if ($65) {
        $74 = $72&255;
        $75 = HEAP32[$8>>2]|0;
        $76 = (($75) + 1)|0;
        HEAP32[$8>>2] = $76;
        $77 = HEAP32[$9>>2]|0;
        $78 = (($77) + ($75)|0);
        HEAP8[$78>>0] = $74;
        $79 = HEAP16[$7>>1]|0;
        $80 = ($79&65535) >>> 8;
        $81 = $80&255;
        $82 = HEAP32[$8>>2]|0;
        $83 = (($82) + 1)|0;
        HEAP32[$8>>2] = $83;
        $84 = HEAP32[$9>>2]|0;
        $85 = (($84) + ($82)|0);
        HEAP8[$85>>0] = $81;
        $86 = HEAP32[$5>>2]|0;
        $87 = (16 - ($86))|0;
        $88 = $68 >>> $87;
        $89 = $88&65535;
        HEAP16[$7>>1] = $89;
        $90 = (($62) + -16)|0;
        $91 = (($86) + ($90))|0;
        HEAP32[$5>>2] = $91;
        $97 = $91;$count$2 = $count$0;
        break;
       } else {
        $92 = (($63) + ($62))|0;
        HEAP32[$5>>2] = $92;
        $97 = $92;$count$2 = $count$0;
        break;
       }
      }
     } while(0);
     $93 = HEAP16[$12>>1]|0;
     $94 = $93&65535;
     $95 = (16 - ($94))|0;
     $96 = ($97|0)>($95|0);
     $98 = HEAP16[$13>>1]|0;
     $99 = $98&65535;
     $100 = $99 << $97;
     $101 = HEAP16[$7>>1]|0;
     $102 = $101&65535;
     $103 = $102 | $100;
     $104 = $103&65535;
     HEAP16[$7>>1] = $104;
     if ($96) {
      $105 = $103&255;
      $106 = HEAP32[$8>>2]|0;
      $107 = (($106) + 1)|0;
      HEAP32[$8>>2] = $107;
      $108 = HEAP32[$9>>2]|0;
      $109 = (($108) + ($106)|0);
      HEAP8[$109>>0] = $105;
      $110 = HEAP16[$7>>1]|0;
      $111 = ($110&65535) >>> 8;
      $112 = $111&255;
      $113 = HEAP32[$8>>2]|0;
      $114 = (($113) + 1)|0;
      HEAP32[$8>>2] = $114;
      $115 = HEAP32[$9>>2]|0;
      $116 = (($115) + ($113)|0);
      HEAP8[$116>>0] = $112;
      $117 = HEAP32[$5>>2]|0;
      $118 = (16 - ($117))|0;
      $119 = $99 >>> $118;
      $120 = $119&65535;
      HEAP16[$7>>1] = $120;
      $121 = (($94) + -16)|0;
      $122 = (($117) + ($121))|0;
      $129 = $119;$storemerge = $122;
     } else {
      $123 = (($97) + ($94))|0;
      $129 = $103;$storemerge = $123;
     }
     HEAP32[$5>>2] = $storemerge;
     $124 = ($storemerge|0)>(14);
     $125 = (($count$2) + 65533)|0;
     $126 = $125 & 65535;
     $127 = $126 << $storemerge;
     $128 = $129 & 65535;
     $130 = $128 | $127;
     $131 = $130&65535;
     HEAP16[$7>>1] = $131;
     if ($124) {
      $132 = $130&255;
      $133 = HEAP32[$8>>2]|0;
      $134 = (($133) + 1)|0;
      HEAP32[$8>>2] = $134;
      $135 = HEAP32[$9>>2]|0;
      $136 = (($135) + ($133)|0);
      HEAP8[$136>>0] = $132;
      $137 = HEAP16[$7>>1]|0;
      $138 = ($137&65535) >>> 8;
      $139 = $138&255;
      $140 = HEAP32[$8>>2]|0;
      $141 = (($140) + 1)|0;
      HEAP32[$8>>2] = $141;
      $142 = HEAP32[$9>>2]|0;
      $143 = (($142) + ($140)|0);
      HEAP8[$143>>0] = $139;
      $144 = HEAP32[$5>>2]|0;
      $145 = (16 - ($144))|0;
      $146 = $126 >>> $145;
      $147 = $146&65535;
      HEAP16[$7>>1] = $147;
      $148 = (($144) + -14)|0;
      HEAP32[$5>>2] = $148;
      break;
     } else {
      $149 = (($storemerge) + 2)|0;
      HEAP32[$5>>2] = $149;
      break;
     }
    }
    $150 = ($19|0)<(11);
    if ($150) {
     $151 = HEAP16[$4>>1]|0;
     $152 = $151&65535;
     $153 = HEAP32[$5>>2]|0;
     $154 = (16 - ($152))|0;
     $155 = ($153|0)>($154|0);
     $156 = HEAP16[$6>>1]|0;
     $157 = $156&65535;
     $158 = $157 << $153;
     $159 = HEAP16[$7>>1]|0;
     $160 = $159&65535;
     $161 = $160 | $158;
     $162 = $161&65535;
     HEAP16[$7>>1] = $162;
     if ($155) {
      $163 = $161&255;
      $164 = HEAP32[$8>>2]|0;
      $165 = (($164) + 1)|0;
      HEAP32[$8>>2] = $165;
      $166 = HEAP32[$9>>2]|0;
      $167 = (($166) + ($164)|0);
      HEAP8[$167>>0] = $163;
      $168 = HEAP16[$7>>1]|0;
      $169 = ($168&65535) >>> 8;
      $170 = $169&255;
      $171 = HEAP32[$8>>2]|0;
      $172 = (($171) + 1)|0;
      HEAP32[$8>>2] = $172;
      $173 = HEAP32[$9>>2]|0;
      $174 = (($173) + ($171)|0);
      HEAP8[$174>>0] = $170;
      $175 = HEAP32[$5>>2]|0;
      $176 = (16 - ($175))|0;
      $177 = $157 >>> $176;
      $178 = $177&65535;
      HEAP16[$7>>1] = $178;
      $179 = (($152) + -16)|0;
      $180 = (($175) + ($179))|0;
      $187 = $177;$storemerge4 = $180;
     } else {
      $181 = (($153) + ($152))|0;
      $187 = $161;$storemerge4 = $181;
     }
     HEAP32[$5>>2] = $storemerge4;
     $182 = ($storemerge4|0)>(13);
     $183 = (($count$0) + 65534)|0;
     $184 = $183 & 65535;
     $185 = $184 << $storemerge4;
     $186 = $187 & 65535;
     $188 = $186 | $185;
     $189 = $188&65535;
     HEAP16[$7>>1] = $189;
     if ($182) {
      $190 = $188&255;
      $191 = HEAP32[$8>>2]|0;
      $192 = (($191) + 1)|0;
      HEAP32[$8>>2] = $192;
      $193 = HEAP32[$9>>2]|0;
      $194 = (($193) + ($191)|0);
      HEAP8[$194>>0] = $190;
      $195 = HEAP16[$7>>1]|0;
      $196 = ($195&65535) >>> 8;
      $197 = $196&255;
      $198 = HEAP32[$8>>2]|0;
      $199 = (($198) + 1)|0;
      HEAP32[$8>>2] = $199;
      $200 = HEAP32[$9>>2]|0;
      $201 = (($200) + ($198)|0);
      HEAP8[$201>>0] = $197;
      $202 = HEAP32[$5>>2]|0;
      $203 = (16 - ($202))|0;
      $204 = $184 >>> $203;
      $205 = $204&65535;
      HEAP16[$7>>1] = $205;
      $206 = (($202) + -13)|0;
      HEAP32[$5>>2] = $206;
      break;
     } else {
      $207 = (($storemerge4) + 3)|0;
      HEAP32[$5>>2] = $207;
      break;
     }
    } else {
     $208 = HEAP16[$10>>1]|0;
     $209 = $208&65535;
     $210 = HEAP32[$5>>2]|0;
     $211 = (16 - ($209))|0;
     $212 = ($210|0)>($211|0);
     $213 = HEAP16[$11>>1]|0;
     $214 = $213&65535;
     $215 = $214 << $210;
     $216 = HEAP16[$7>>1]|0;
     $217 = $216&65535;
     $218 = $217 | $215;
     $219 = $218&65535;
     HEAP16[$7>>1] = $219;
     if ($212) {
      $220 = $218&255;
      $221 = HEAP32[$8>>2]|0;
      $222 = (($221) + 1)|0;
      HEAP32[$8>>2] = $222;
      $223 = HEAP32[$9>>2]|0;
      $224 = (($223) + ($221)|0);
      HEAP8[$224>>0] = $220;
      $225 = HEAP16[$7>>1]|0;
      $226 = ($225&65535) >>> 8;
      $227 = $226&255;
      $228 = HEAP32[$8>>2]|0;
      $229 = (($228) + 1)|0;
      HEAP32[$8>>2] = $229;
      $230 = HEAP32[$9>>2]|0;
      $231 = (($230) + ($228)|0);
      HEAP8[$231>>0] = $227;
      $232 = HEAP32[$5>>2]|0;
      $233 = (16 - ($232))|0;
      $234 = $214 >>> $233;
      $235 = $234&65535;
      HEAP16[$7>>1] = $235;
      $236 = (($209) + -16)|0;
      $237 = (($232) + ($236))|0;
      $244 = $234;$storemerge3 = $237;
     } else {
      $238 = (($210) + ($209))|0;
      $244 = $218;$storemerge3 = $238;
     }
     HEAP32[$5>>2] = $storemerge3;
     $239 = ($storemerge3|0)>(9);
     $240 = (($count$0) + 65526)|0;
     $241 = $240 & 65535;
     $242 = $241 << $storemerge3;
     $243 = $244 & 65535;
     $245 = $243 | $242;
     $246 = $245&65535;
     HEAP16[$7>>1] = $246;
     if ($239) {
      $247 = $245&255;
      $248 = HEAP32[$8>>2]|0;
      $249 = (($248) + 1)|0;
      HEAP32[$8>>2] = $249;
      $250 = HEAP32[$9>>2]|0;
      $251 = (($250) + ($248)|0);
      HEAP8[$251>>0] = $247;
      $252 = HEAP16[$7>>1]|0;
      $253 = ($252&65535) >>> 8;
      $254 = $253&255;
      $255 = HEAP32[$8>>2]|0;
      $256 = (($255) + 1)|0;
      HEAP32[$8>>2] = $256;
      $257 = HEAP32[$9>>2]|0;
      $258 = (($257) + ($255)|0);
      HEAP8[$258>>0] = $254;
      $259 = HEAP32[$5>>2]|0;
      $260 = (16 - ($259))|0;
      $261 = $241 >>> $260;
      $262 = $261&65535;
      HEAP16[$7>>1] = $262;
      $263 = (($259) + -9)|0;
      HEAP32[$5>>2] = $263;
      break;
     } else {
      $264 = (($storemerge3) + 7)|0;
      HEAP32[$5>>2] = $264;
      break;
     }
    }
   }
  } while(0);
  $265 = ($17<<16>>16)==(0);
  if ($265) {
   $prevlen$0$phi = $nextlen$0;$count$0 = 0;$max_count$1 = 138;$min_count$1 = 3;$n$0 = $15;$nextlen$0 = $18;$prevlen$0 = $prevlen$0$phi;
   continue;
  }
  $266 = ($nextlen$0|0)==($18|0);
  $$7 = $266 ? 6 : 7;
  $$8 = $266 ? 3 : 4;
  $prevlen$0$phi = $nextlen$0;$count$0 = 0;$max_count$1 = $$7;$min_count$1 = $$8;$n$0 = $15;$nextlen$0 = $18;$prevlen$0 = $prevlen$0$phi;
 }
 return;
}
function _zcalloc($opaque,$items,$size) {
 $opaque = $opaque|0;
 $items = $items|0;
 $size = $size|0;
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = Math_imul($items, $size)|0;
 $1 = (_malloc($0)|0);
 return ($1|0);
}
function _zcfree($opaque,$ptr) {
 $opaque = $opaque|0;
 $ptr = $ptr|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _free($ptr);
 return;
}
function _adler32($adler,$buf,$len) {
 $adler = $adler|0;
 $buf = $buf|0;
 $len = $len|0;
 var $$ = 0, $$$1 = 0, $$0 = 0, $$02 = 0, $$07 = 0, $$1 = 0, $$13 = 0, $$18 = 0, $$24 = 0, $$29 = 0, $$3 = 0, $$310 = 0, $$35 = 0, $$4 = 0, $$46 = 0, $$5 = 0, $$6 = 0, $$7 = 0, $0 = 0, $1 = 0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0;
 var $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0;
 var $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0;
 var $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0;
 var $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $n$0 = 0, $scevgep = 0, $scevgep18 = 0, $sum2$0 = 0, $sum2$1 = 0, $sum2$2 = 0, $sum2$3 = 0, $sum2$4 = 0;
 var $sum2$5 = 0, $sum2$6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = $adler >>> 16;
 $1 = $adler & 65535;
 $2 = ($len|0)==(1);
 if ($2) {
  $3 = HEAP8[$buf>>0]|0;
  $4 = $3&255;
  $5 = (($1) + ($4))|0;
  $6 = ($5>>>0)>(65520);
  $7 = (($5) + -65521)|0;
  $$ = $6 ? $7 : $5;
  $8 = (($0) + ($$))|0;
  $9 = ($8>>>0)>(65520);
  $10 = (($8) + 15)|0;
  $sum2$0 = $9 ? $10 : $8;
  $11 = $sum2$0 << 16;
  $12 = $$ | $11;
  $$0 = $12;
  return ($$0|0);
 }
 $13 = ($buf|0)==(0|0);
 if ($13) {
  $$0 = 1;
  return ($$0|0);
 }
 $14 = ($len>>>0)<(16);
 if ($14) {
  $$02 = $buf;$$07 = $len;$$1 = $1;$sum2$1 = $0;
  while(1) {
   $15 = ($$07|0)==(0);
   if ($15) {
    break;
   }
   $16 = (($$07) + -1)|0;
   $17 = ((($$02)) + 1|0);
   $18 = HEAP8[$$02>>0]|0;
   $19 = $18&255;
   $20 = (($$1) + ($19))|0;
   $21 = (($sum2$1) + ($20))|0;
   $$02 = $17;$$07 = $16;$$1 = $20;$sum2$1 = $21;
  }
  $22 = ($$1>>>0)>(65520);
  $23 = (($$1) + -65521)|0;
  $$$1 = $22 ? $23 : $$1;
  $24 = (($sum2$1>>>0) % 65521)&-1;
  $25 = $24 << 16;
  $26 = $$$1 | $25;
  $$0 = $26;
  return ($$0|0);
 } else {
  $$13 = $buf;$$18 = $len;$$3 = $1;$sum2$2 = $0;
 }
 while(1) {
  $27 = ($$18>>>0)>(5551);
  if (!($27)) {
   break;
  }
  $28 = (($$18) + -5552)|0;
  $$24 = $$13;$$4 = $$3;$n$0 = 347;$sum2$3 = $sum2$2;
  while(1) {
   $29 = HEAP8[$$24>>0]|0;
   $30 = $29&255;
   $31 = (($$4) + ($30))|0;
   $32 = (($sum2$3) + ($31))|0;
   $33 = ((($$24)) + 1|0);
   $34 = HEAP8[$33>>0]|0;
   $35 = $34&255;
   $36 = (($31) + ($35))|0;
   $37 = (($32) + ($36))|0;
   $38 = ((($$24)) + 2|0);
   $39 = HEAP8[$38>>0]|0;
   $40 = $39&255;
   $41 = (($36) + ($40))|0;
   $42 = (($37) + ($41))|0;
   $43 = ((($$24)) + 3|0);
   $44 = HEAP8[$43>>0]|0;
   $45 = $44&255;
   $46 = (($41) + ($45))|0;
   $47 = (($42) + ($46))|0;
   $48 = ((($$24)) + 4|0);
   $49 = HEAP8[$48>>0]|0;
   $50 = $49&255;
   $51 = (($46) + ($50))|0;
   $52 = (($47) + ($51))|0;
   $53 = ((($$24)) + 5|0);
   $54 = HEAP8[$53>>0]|0;
   $55 = $54&255;
   $56 = (($51) + ($55))|0;
   $57 = (($52) + ($56))|0;
   $58 = ((($$24)) + 6|0);
   $59 = HEAP8[$58>>0]|0;
   $60 = $59&255;
   $61 = (($56) + ($60))|0;
   $62 = (($57) + ($61))|0;
   $63 = ((($$24)) + 7|0);
   $64 = HEAP8[$63>>0]|0;
   $65 = $64&255;
   $66 = (($61) + ($65))|0;
   $67 = (($62) + ($66))|0;
   $68 = ((($$24)) + 8|0);
   $69 = HEAP8[$68>>0]|0;
   $70 = $69&255;
   $71 = (($66) + ($70))|0;
   $72 = (($67) + ($71))|0;
   $73 = ((($$24)) + 9|0);
   $74 = HEAP8[$73>>0]|0;
   $75 = $74&255;
   $76 = (($71) + ($75))|0;
   $77 = (($72) + ($76))|0;
   $78 = ((($$24)) + 10|0);
   $79 = HEAP8[$78>>0]|0;
   $80 = $79&255;
   $81 = (($76) + ($80))|0;
   $82 = (($77) + ($81))|0;
   $83 = ((($$24)) + 11|0);
   $84 = HEAP8[$83>>0]|0;
   $85 = $84&255;
   $86 = (($81) + ($85))|0;
   $87 = (($82) + ($86))|0;
   $88 = ((($$24)) + 12|0);
   $89 = HEAP8[$88>>0]|0;
   $90 = $89&255;
   $91 = (($86) + ($90))|0;
   $92 = (($87) + ($91))|0;
   $93 = ((($$24)) + 13|0);
   $94 = HEAP8[$93>>0]|0;
   $95 = $94&255;
   $96 = (($91) + ($95))|0;
   $97 = (($92) + ($96))|0;
   $98 = ((($$24)) + 14|0);
   $99 = HEAP8[$98>>0]|0;
   $100 = $99&255;
   $101 = (($96) + ($100))|0;
   $102 = (($97) + ($101))|0;
   $103 = ((($$24)) + 15|0);
   $104 = HEAP8[$103>>0]|0;
   $105 = $104&255;
   $106 = (($101) + ($105))|0;
   $107 = (($102) + ($106))|0;
   $108 = ((($$24)) + 16|0);
   $109 = (($n$0) + -1)|0;
   $110 = ($109|0)==(0);
   if ($110) {
    break;
   } else {
    $$24 = $108;$$4 = $106;$n$0 = $109;$sum2$3 = $107;
   }
  }
  $scevgep18 = ((($$13)) + 5552|0);
  $111 = (($106>>>0) % 65521)&-1;
  $112 = (($107>>>0) % 65521)&-1;
  $$13 = $scevgep18;$$18 = $28;$$3 = $111;$sum2$2 = $112;
 }
 $113 = ($$18|0)==(0);
 if ($113) {
  $$7 = $$3;$sum2$6 = $sum2$2;
 } else {
  $114 = ($$18>>>0)<(15);
  $115 = $114 ? $$18 : 15;
  $116 = $115 ^ -1;
  $117 = (($$18) + ($116))|0;
  $118 = (($117) + 16)|0;
  $119 = $118 & -16;
  $scevgep = (($$13) + ($119)|0);
  $$29 = $$18;$$35 = $$13;$$5 = $$3;$sum2$4 = $sum2$2;
  while(1) {
   $120 = ($$29>>>0)>(15);
   if (!($120)) {
    break;
   }
   $122 = (($$29) + -16)|0;
   $123 = HEAP8[$$35>>0]|0;
   $124 = $123&255;
   $125 = (($$5) + ($124))|0;
   $126 = (($sum2$4) + ($125))|0;
   $127 = ((($$35)) + 1|0);
   $128 = HEAP8[$127>>0]|0;
   $129 = $128&255;
   $130 = (($125) + ($129))|0;
   $131 = (($126) + ($130))|0;
   $132 = ((($$35)) + 2|0);
   $133 = HEAP8[$132>>0]|0;
   $134 = $133&255;
   $135 = (($130) + ($134))|0;
   $136 = (($131) + ($135))|0;
   $137 = ((($$35)) + 3|0);
   $138 = HEAP8[$137>>0]|0;
   $139 = $138&255;
   $140 = (($135) + ($139))|0;
   $141 = (($136) + ($140))|0;
   $142 = ((($$35)) + 4|0);
   $143 = HEAP8[$142>>0]|0;
   $144 = $143&255;
   $145 = (($140) + ($144))|0;
   $146 = (($141) + ($145))|0;
   $147 = ((($$35)) + 5|0);
   $148 = HEAP8[$147>>0]|0;
   $149 = $148&255;
   $150 = (($145) + ($149))|0;
   $151 = (($146) + ($150))|0;
   $152 = ((($$35)) + 6|0);
   $153 = HEAP8[$152>>0]|0;
   $154 = $153&255;
   $155 = (($150) + ($154))|0;
   $156 = (($151) + ($155))|0;
   $157 = ((($$35)) + 7|0);
   $158 = HEAP8[$157>>0]|0;
   $159 = $158&255;
   $160 = (($155) + ($159))|0;
   $161 = (($156) + ($160))|0;
   $162 = ((($$35)) + 8|0);
   $163 = HEAP8[$162>>0]|0;
   $164 = $163&255;
   $165 = (($160) + ($164))|0;
   $166 = (($161) + ($165))|0;
   $167 = ((($$35)) + 9|0);
   $168 = HEAP8[$167>>0]|0;
   $169 = $168&255;
   $170 = (($165) + ($169))|0;
   $171 = (($166) + ($170))|0;
   $172 = ((($$35)) + 10|0);
   $173 = HEAP8[$172>>0]|0;
   $174 = $173&255;
   $175 = (($170) + ($174))|0;
   $176 = (($171) + ($175))|0;
   $177 = ((($$35)) + 11|0);
   $178 = HEAP8[$177>>0]|0;
   $179 = $178&255;
   $180 = (($175) + ($179))|0;
   $181 = (($176) + ($180))|0;
   $182 = ((($$35)) + 12|0);
   $183 = HEAP8[$182>>0]|0;
   $184 = $183&255;
   $185 = (($180) + ($184))|0;
   $186 = (($181) + ($185))|0;
   $187 = ((($$35)) + 13|0);
   $188 = HEAP8[$187>>0]|0;
   $189 = $188&255;
   $190 = (($185) + ($189))|0;
   $191 = (($186) + ($190))|0;
   $192 = ((($$35)) + 14|0);
   $193 = HEAP8[$192>>0]|0;
   $194 = $193&255;
   $195 = (($190) + ($194))|0;
   $196 = (($191) + ($195))|0;
   $197 = ((($$35)) + 15|0);
   $198 = HEAP8[$197>>0]|0;
   $199 = $198&255;
   $200 = (($195) + ($199))|0;
   $201 = (($196) + ($200))|0;
   $202 = ((($$35)) + 16|0);
   $$29 = $122;$$35 = $202;$$5 = $200;$sum2$4 = $201;
  }
  $121 = (($$18) - ($119))|0;
  $$310 = $121;$$46 = $scevgep;$$6 = $$5;$sum2$5 = $sum2$4;
  while(1) {
   $203 = ($$310|0)==(0);
   if ($203) {
    break;
   }
   $204 = (($$310) + -1)|0;
   $205 = ((($$46)) + 1|0);
   $206 = HEAP8[$$46>>0]|0;
   $207 = $206&255;
   $208 = (($$6) + ($207))|0;
   $209 = (($sum2$5) + ($208))|0;
   $$310 = $204;$$46 = $205;$$6 = $208;$sum2$5 = $209;
  }
  $210 = (($$6>>>0) % 65521)&-1;
  $211 = (($sum2$5>>>0) % 65521)&-1;
  $$7 = $210;$sum2$6 = $211;
 }
 $212 = $sum2$6 << 16;
 $213 = $$7 | $212;
 $$0 = $213;
 return ($$0|0);
}
function ___stdio_close($f) {
 $f = $f|0;
 var $$0$i = 0, $$0$i$i = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp;
 $0 = ((($f)) + 60|0);
 $1 = HEAP32[$0>>2]|0;
 HEAP32[$vararg_buffer>>2] = $1;
 $2 = (___syscall6(6,($vararg_buffer|0))|0);
 $3 = ($2>>>0)>(4294963200);
 if ($3) {
  $4 = (0 - ($2))|0;
  $5 = HEAP32[4331]|0;
  $6 = ($5|0)==(0|0);
  if ($6) {
   $$0$i$i = 17368;
  } else {
   $7 = (_pthread_self()|0);
   $8 = ((($7)) + 64|0);
   $9 = HEAP32[$8>>2]|0;
   $$0$i$i = $9;
  }
  HEAP32[$$0$i$i>>2] = $4;
  $$0$i = -1;
 } else {
  $$0$i = $2;
 }
 STACKTOP = sp;return ($$0$i|0);
}
function ___stdio_seek($f,$off,$whence) {
 $f = $f|0;
 $off = $off|0;
 $whence = $whence|0;
 var $$0$i$i = 0, $$pre = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $ret = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp;
 $ret = sp + 20|0;
 $0 = ((($f)) + 60|0);
 $1 = HEAP32[$0>>2]|0;
 HEAP32[$vararg_buffer>>2] = $1;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $off;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $ret;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $whence;
 $2 = (___syscall140(140,($vararg_buffer|0))|0);
 $3 = ($2>>>0)>(4294963200);
 if ($3) {
  $4 = (0 - ($2))|0;
  $5 = HEAP32[4331]|0;
  $6 = ($5|0)==(0|0);
  if ($6) {
   $$0$i$i = 17368;
  } else {
   $7 = (_pthread_self()|0);
   $8 = ((($7)) + 64|0);
   $9 = HEAP32[$8>>2]|0;
   $$0$i$i = $9;
  }
  HEAP32[$$0$i$i>>2] = $4;
  label = 7;
 } else {
  $10 = ($2|0)<(0);
  if ($10) {
   label = 7;
  } else {
   $$pre = HEAP32[$ret>>2]|0;
   $11 = $$pre;
  }
 }
 if ((label|0) == 7) {
  HEAP32[$ret>>2] = -1;
  $11 = -1;
 }
 STACKTOP = sp;return ($11|0);
}
function ___stdio_write($f,$buf,$len) {
 $f = $f|0;
 $buf = $buf|0;
 $len = $len|0;
 var $$0 = 0, $$0$i = 0, $$0$i$i = 0, $$0$i$i1 = 0, $$phi$trans$insert = 0, $$pre = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0;
 var $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0;
 var $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $7 = 0, $8 = 0, $9 = 0, $cnt$0 = 0, $cnt$1 = 0, $iov$0 = 0, $iov$1 = 0, $iovcnt$0 = 0, $iovcnt$1 = 0, $iovs = 0, $rem$0 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0;
 var $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $iovs = sp + 32|0;
 $0 = ((($f)) + 28|0);
 $1 = HEAP32[$0>>2]|0;
 HEAP32[$iovs>>2] = $1;
 $2 = ((($iovs)) + 4|0);
 $3 = ((($f)) + 20|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = (($4) - ($1))|0;
 HEAP32[$2>>2] = $5;
 $6 = ((($iovs)) + 8|0);
 HEAP32[$6>>2] = $buf;
 $7 = ((($iovs)) + 12|0);
 HEAP32[$7>>2] = $len;
 $8 = (($5) + ($len))|0;
 $9 = ((($f)) + 60|0);
 $10 = ((($f)) + 44|0);
 $iov$0 = $iovs;$iovcnt$0 = 2;$rem$0 = $8;
 while(1) {
  $11 = HEAP32[4331]|0;
  $12 = ($11|0)==(0|0);
  if ($12) {
   $22 = HEAP32[$9>>2]|0;
   HEAP32[$vararg_buffer3>>2] = $22;
   $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
   HEAP32[$vararg_ptr6>>2] = $iov$0;
   $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
   HEAP32[$vararg_ptr7>>2] = $iovcnt$0;
   $23 = (___syscall146(146,($vararg_buffer3|0))|0);
   $24 = ($23>>>0)>(4294963200);
   if ($24) {
    $25 = (0 - ($23))|0;
    $26 = HEAP32[4331]|0;
    $27 = ($26|0)==(0|0);
    if ($27) {
     $$0$i$i1 = 17368;
    } else {
     $28 = (_pthread_self()|0);
     $29 = ((($28)) + 64|0);
     $30 = HEAP32[$29>>2]|0;
     $$0$i$i1 = $30;
    }
    HEAP32[$$0$i$i1>>2] = $25;
    $cnt$0 = -1;
   } else {
    $cnt$0 = $23;
   }
  } else {
   _pthread_cleanup_push((30|0),($f|0));
   $13 = HEAP32[$9>>2]|0;
   HEAP32[$vararg_buffer>>2] = $13;
   $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
   HEAP32[$vararg_ptr1>>2] = $iov$0;
   $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
   HEAP32[$vararg_ptr2>>2] = $iovcnt$0;
   $14 = (___syscall146(146,($vararg_buffer|0))|0);
   $15 = ($14>>>0)>(4294963200);
   if ($15) {
    $16 = (0 - ($14))|0;
    $17 = HEAP32[4331]|0;
    $18 = ($17|0)==(0|0);
    if ($18) {
     $$0$i$i = 17368;
    } else {
     $19 = (_pthread_self()|0);
     $20 = ((($19)) + 64|0);
     $21 = HEAP32[$20>>2]|0;
     $$0$i$i = $21;
    }
    HEAP32[$$0$i$i>>2] = $16;
    $$0$i = -1;
   } else {
    $$0$i = $14;
   }
   _pthread_cleanup_pop(0);
   $cnt$0 = $$0$i;
  }
  $31 = ($rem$0|0)==($cnt$0|0);
  if ($31) {
   label = 13;
   break;
  }
  $38 = ($cnt$0|0)<(0);
  if ($38) {
   label = 15;
   break;
  }
  $46 = (($rem$0) - ($cnt$0))|0;
  $47 = ((($iov$0)) + 4|0);
  $48 = HEAP32[$47>>2]|0;
  $49 = ($cnt$0>>>0)>($48>>>0);
  if ($49) {
   $50 = HEAP32[$10>>2]|0;
   HEAP32[$0>>2] = $50;
   HEAP32[$3>>2] = $50;
   $51 = (($cnt$0) - ($48))|0;
   $52 = ((($iov$0)) + 8|0);
   $53 = (($iovcnt$0) + -1)|0;
   $$phi$trans$insert = ((($iov$0)) + 12|0);
   $$pre = HEAP32[$$phi$trans$insert>>2]|0;
   $61 = $$pre;$cnt$1 = $51;$iov$1 = $52;$iovcnt$1 = $53;
  } else {
   $54 = ($iovcnt$0|0)==(2);
   if ($54) {
    $55 = HEAP32[$0>>2]|0;
    $56 = (($55) + ($cnt$0)|0);
    HEAP32[$0>>2] = $56;
    $61 = $48;$cnt$1 = $cnt$0;$iov$1 = $iov$0;$iovcnt$1 = 2;
   } else {
    $61 = $48;$cnt$1 = $cnt$0;$iov$1 = $iov$0;$iovcnt$1 = $iovcnt$0;
   }
  }
  $57 = HEAP32[$iov$1>>2]|0;
  $58 = (($57) + ($cnt$1)|0);
  HEAP32[$iov$1>>2] = $58;
  $59 = ((($iov$1)) + 4|0);
  $60 = (($61) - ($cnt$1))|0;
  HEAP32[$59>>2] = $60;
  $iov$0 = $iov$1;$iovcnt$0 = $iovcnt$1;$rem$0 = $46;
 }
 if ((label|0) == 13) {
  $32 = HEAP32[$10>>2]|0;
  $33 = ((($f)) + 48|0);
  $34 = HEAP32[$33>>2]|0;
  $35 = (($32) + ($34)|0);
  $36 = ((($f)) + 16|0);
  HEAP32[$36>>2] = $35;
  $37 = $32;
  HEAP32[$0>>2] = $37;
  HEAP32[$3>>2] = $37;
  $$0 = $len;
 }
 else if ((label|0) == 15) {
  $39 = ((($f)) + 16|0);
  HEAP32[$39>>2] = 0;
  HEAP32[$0>>2] = 0;
  HEAP32[$3>>2] = 0;
  $40 = HEAP32[$f>>2]|0;
  $41 = $40 | 32;
  HEAP32[$f>>2] = $41;
  $42 = ($iovcnt$0|0)==(2);
  if ($42) {
   $$0 = 0;
  } else {
   $43 = ((($iov$0)) + 4|0);
   $44 = HEAP32[$43>>2]|0;
   $45 = (($len) - ($44))|0;
   $$0 = $45;
  }
 }
 STACKTOP = sp;return ($$0|0);
}
function _cleanup_604($p) {
 $p = $p|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function ___stdout_write($f,$buf,$len) {
 $f = $f|0;
 $buf = $buf|0;
 $len = $len|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $tio = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp;
 $tio = sp + 12|0;
 $0 = ((($f)) + 36|0);
 HEAP32[$0>>2] = 8;
 $1 = HEAP32[$f>>2]|0;
 $2 = $1 & 64;
 $3 = ($2|0)==(0);
 if ($3) {
  $4 = ((($f)) + 60|0);
  $5 = HEAP32[$4>>2]|0;
  HEAP32[$vararg_buffer>>2] = $5;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21505;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $tio;
  $6 = (___syscall54(54,($vararg_buffer|0))|0);
  $7 = ($6|0)==(0);
  if (!($7)) {
   $8 = ((($f)) + 75|0);
   HEAP8[$8>>0] = -1;
  }
 }
 $9 = (___stdio_write($f,$buf,$len)|0);
 STACKTOP = sp;return ($9|0);
}
function _htons($n) {
 $n = $n|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = $n&65535;
 $1 = $0 << 8;
 $2 = $0 >>> 8;
 $3 = $1 | $2;
 $4 = $3&65535;
 return ($4|0);
}
function _snprintf($s,$n,$fmt,$varargs) {
 $s = $s|0;
 $n = $n|0;
 $fmt = $fmt|0;
 $varargs = $varargs|0;
 var $$$02$i = 0, $$0$i$i = 0, $$01$i = 0, $$02$i = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $ap = 0, $b$i = 0, $f$i = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 144|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $b$i = sp + 128|0;
 $f$i = sp + 16|0;
 $ap = sp;
 HEAP32[$ap>>2] = $varargs;
 dest=$f$i; src=9284; stop=dest+112|0; do { HEAP32[dest>>2]=HEAP32[src>>2]|0; dest=dest+4|0; src=src+4|0; } while ((dest|0) < (stop|0));
 $0 = (($n) + -1)|0;
 $1 = ($0>>>0)>(2147483646);
 if ($1) {
  $2 = ($n|0)==(0);
  if ($2) {
   $$01$i = $b$i;$$02$i = 1;
   label = 6;
  } else {
   $3 = HEAP32[4331]|0;
   $4 = ($3|0)==(0|0);
   if ($4) {
    $$0$i$i = 17368;
   } else {
    $5 = (_pthread_self()|0);
    $6 = ((($5)) + 64|0);
    $7 = HEAP32[$6>>2]|0;
    $$0$i$i = $7;
   }
   HEAP32[$$0$i$i>>2] = 75;
  }
 } else {
  $$01$i = $s;$$02$i = $n;
  label = 6;
 }
 if ((label|0) == 6) {
  $8 = $$01$i;
  $9 = (-2 - ($8))|0;
  $10 = ($$02$i>>>0)>($9>>>0);
  $$$02$i = $10 ? $9 : $$02$i;
  $11 = ((($f$i)) + 48|0);
  HEAP32[$11>>2] = $$$02$i;
  $12 = ((($f$i)) + 20|0);
  HEAP32[$12>>2] = $$01$i;
  $13 = ((($f$i)) + 44|0);
  HEAP32[$13>>2] = $$01$i;
  $14 = (($$01$i) + ($$$02$i)|0);
  $15 = ((($f$i)) + 16|0);
  HEAP32[$15>>2] = $14;
  $16 = ((($f$i)) + 28|0);
  HEAP32[$16>>2] = $14;
  (_vfprintf($f$i,$fmt,$ap)|0);
  $17 = ($$$02$i|0)==(0);
  if (!($17)) {
   $18 = HEAP32[$12>>2]|0;
   $19 = HEAP32[$15>>2]|0;
   $20 = ($18|0)==($19|0);
   $21 = $20 << 31 >> 31;
   $22 = (($18) + ($21)|0);
   HEAP8[$22>>0] = 0;
  }
 }
 STACKTOP = sp;return;
}
function _sn_write($f,$s,$l) {
 $f = $f|0;
 $s = $s|0;
 $l = $l|0;
 var $$cast = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $l$ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($f)) + 16|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($f)) + 20|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = (($1) - ($3))|0;
 $5 = ($4>>>0)>($l>>>0);
 $l$ = $5 ? $l : $4;
 $$cast = $3;
 _memcpy(($$cast|0),($s|0),($l$|0))|0;
 $6 = HEAP32[$2>>2]|0;
 $7 = (($6) + ($l$)|0);
 HEAP32[$2>>2] = $7;
 return ($l|0);
}
function _vfprintf($f,$fmt,$ap) {
 $f = $f|0;
 $fmt = $fmt|0;
 $ap = $ap|0;
 var $$ = 0, $$0 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $ap2 = 0, $internal_buf = 0, $nl_arg = 0, $nl_type = 0, $ret$1 = 0, $ret$1$ = 0, $vacopy_currentptr = 0, dest = 0, label = 0, sp = 0;
 var stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $ap2 = sp + 120|0;
 $nl_type = sp + 80|0;
 $nl_arg = sp;
 $internal_buf = sp + 136|0;
 dest=$nl_type; stop=dest+40|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 $vacopy_currentptr = HEAP32[$ap>>2]|0;
 HEAP32[$ap2>>2] = $vacopy_currentptr;
 $0 = (_printf_core(0,$fmt,$ap2,$nl_arg,$nl_type)|0);
 $1 = ($0|0)<(0);
 if ($1) {
  $$0 = -1;
 } else {
  $2 = HEAP32[$f>>2]|0;
  $3 = $2 & 32;
  $4 = ((($f)) + 74|0);
  $5 = HEAP8[$4>>0]|0;
  $6 = ($5<<24>>24)<(1);
  if ($6) {
   $7 = $2 & -33;
   HEAP32[$f>>2] = $7;
  }
  $8 = ((($f)) + 48|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = ($9|0)==(0);
  if ($10) {
   $12 = ((($f)) + 44|0);
   $13 = HEAP32[$12>>2]|0;
   HEAP32[$12>>2] = $internal_buf;
   $14 = ((($f)) + 28|0);
   HEAP32[$14>>2] = $internal_buf;
   $15 = ((($f)) + 20|0);
   HEAP32[$15>>2] = $internal_buf;
   HEAP32[$8>>2] = 80;
   $16 = ((($internal_buf)) + 80|0);
   $17 = ((($f)) + 16|0);
   HEAP32[$17>>2] = $16;
   $18 = (_printf_core($f,$fmt,$ap2,$nl_arg,$nl_type)|0);
   $19 = ($13|0)==(0|0);
   if ($19) {
    $ret$1 = $18;
   } else {
    $20 = ((($f)) + 36|0);
    $21 = HEAP32[$20>>2]|0;
    (FUNCTION_TABLE_iiii[$21 & 31]($f,0,0)|0);
    $22 = HEAP32[$15>>2]|0;
    $23 = ($22|0)==(0|0);
    $$ = $23 ? -1 : $18;
    HEAP32[$12>>2] = $13;
    HEAP32[$8>>2] = 0;
    HEAP32[$17>>2] = 0;
    HEAP32[$14>>2] = 0;
    HEAP32[$15>>2] = 0;
    $ret$1 = $$;
   }
  } else {
   $11 = (_printf_core($f,$fmt,$ap2,$nl_arg,$nl_type)|0);
   $ret$1 = $11;
  }
  $24 = HEAP32[$f>>2]|0;
  $25 = $24 & 32;
  $26 = ($25|0)==(0);
  $ret$1$ = $26 ? $ret$1 : -1;
  $27 = $24 | $3;
  HEAP32[$f>>2] = $27;
  $$0 = $ret$1$;
 }
 STACKTOP = sp;return ($$0|0);
}
function _printf_core($f,$fmt,$ap,$nl_arg,$nl_type) {
 $f = $f|0;
 $fmt = $fmt|0;
 $ap = $ap|0;
 $nl_arg = $nl_arg|0;
 $nl_type = $nl_type|0;
 var $$ = 0, $$$i = 0, $$0 = 0, $$0$i = 0, $$0$i1 = 0, $$0$i2 = 0, $$0$lcssa$i = 0, $$012$i = 0, $$013$i = 0, $$03$i33 = 0, $$07$i = 0.0, $$1$i = 0.0, $$114$i = 0, $$2$i = 0.0, $$20$i = 0.0, $$210$$24$i = 0, $$210$$26$i = 0, $$210$i = 0, $$23$i = 0, $$25$i = 0;
 var $$3$i = 0.0, $$311$i = 0, $$33$i = 0, $$36$i = 0.0, $$4$i = 0.0, $$412$lcssa$i = 0, $$41278$i = 0, $$43 = 0, $$5$lcssa$i = 0, $$589$i = 0, $$a$3$i = 0, $$a$3191$i = 0, $$a$3192$i = 0, $$fl$4 = 0, $$l10n$0 = 0, $$lcssa162$i = 0, $$neg55$i = 0, $$neg56$i = 0, $$p$$i = 0, $$p$5 = 0;
 var $$p$i = 0, $$phi$trans$insert = 0, $$pn$i = 0, $$pr$i = 0, $$pr50$i = 0, $$pre = 0, $$pre$i = 0, $$pre$phi190$iZ2D = 0, $$pre170 = 0, $$pre171 = 0, $$pre185$i = 0, $$pre188$i = 0, $$pre189$i = 0, $$pre47 = 0, $$z$3$i = 0, $$z$4$i = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0;
 var $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0;
 var $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0;
 var $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0;
 var $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0;
 var $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0;
 var $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0;
 var $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0;
 var $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0;
 var $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0;
 var $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0;
 var $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0;
 var $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0;
 var $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0;
 var $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0;
 var $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0;
 var $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0.0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0.0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0;
 var $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0;
 var $408 = 0, $409 = 0.0, $41 = 0, $410 = 0.0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0.0;
 var $426 = 0, $427 = 0, $428 = 0, $429 = 0.0, $43 = 0, $430 = 0.0, $431 = 0.0, $432 = 0.0, $433 = 0.0, $434 = 0.0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0;
 var $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0.0, $461 = 0.0;
 var $462 = 0.0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0;
 var $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0.0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0;
 var $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0.0, $502 = 0.0, $503 = 0.0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0;
 var $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0;
 var $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0;
 var $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0;
 var $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0;
 var $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0;
 var $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0.0, $613 = 0.0, $614 = 0, $615 = 0.0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0;
 var $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0;
 var $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0;
 var $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0;
 var $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0;
 var $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0;
 var $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0;
 var $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0;
 var $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0;
 var $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0;
 var $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0;
 var $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0, $814 = 0, $815 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0;
 var $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $a$0 = 0, $a$1 = 0, $a$1$lcssa$i = 0, $a$1149$i = 0, $a$2 = 0, $a$2$ph$i = 0, $a$3$lcssa$i = 0, $a$3136$i = 0;
 var $a$5$lcssa$i = 0, $a$5111$i = 0, $a$6$i = 0, $a$8$i = 0, $a$9$ph$i = 0, $arg = 0, $arglist_current = 0, $arglist_current2 = 0, $arglist_next = 0, $arglist_next3 = 0, $argpos$0 = 0, $big$i = 0, $buf = 0, $buf$i = 0, $carry$0142$i = 0, $carry3$0130$i = 0, $cnt$0 = 0, $cnt$1 = 0, $d$0$i = 0, $d$0141$i = 0;
 var $d$0143$i = 0, $d$1129$i = 0, $d$2$lcssa$i = 0, $d$2110$i = 0, $d$4$i = 0, $d$584$i = 0, $d$677$i = 0, $d$788$i = 0, $e$0125$i = 0, $e$1$i = 0, $e$2106$i = 0, $e$4$i = 0, $e$5$ph$i = 0, $e2$i = 0, $ebuf0$i = 0, $estr$0$i = 0, $estr$1$lcssa$i = 0, $estr$195$i = 0, $estr$2$i = 0, $exitcond$i = 0;
 var $expanded = 0, $expanded10 = 0, $expanded11 = 0, $expanded13 = 0, $expanded14 = 0, $expanded15 = 0, $expanded4 = 0, $expanded6 = 0, $expanded7 = 0, $expanded8 = 0, $fl$0100 = 0, $fl$053 = 0, $fl$1 = 0, $fl$1$ = 0, $fl$3 = 0, $fl$4 = 0, $fl$6 = 0, $i$0$lcssa = 0, $i$0$lcssa178 = 0, $i$0105 = 0;
 var $i$0124$i = 0, $i$03$i = 0, $i$03$i25 = 0, $i$03$i4 = 0, $i$1$lcssa$i = 0, $i$1116 = 0, $i$1118$i = 0, $i$12$i = 0, $i$2105$i = 0, $i$291 = 0, $i$3101$i = 0, $i$389 = 0, $isdigit = 0, $isdigit$i = 0, $isdigit$i27 = 0, $isdigit10 = 0, $isdigit12 = 0, $isdigit2$i = 0, $isdigit2$i23 = 0, $isdigittmp = 0;
 var $isdigittmp$ = 0, $isdigittmp$i = 0, $isdigittmp$i26 = 0, $isdigittmp1$i = 0, $isdigittmp1$i22 = 0, $isdigittmp11 = 0, $isdigittmp4$i = 0, $isdigittmp4$i24 = 0, $isdigittmp9 = 0, $j$0$i = 0, $j$0117$i = 0, $j$0119$i = 0, $j$1102$i = 0, $j$2$i = 0, $l$0 = 0, $l$0$i = 0, $l$1$i = 0, $l$1104 = 0, $l$2 = 0, $l10n$0 = 0;
 var $l10n$0$phi = 0, $l10n$1 = 0, $l10n$2 = 0, $l10n$3 = 0, $mb = 0, $notlhs$i = 0, $notrhs$i = 0, $or$cond = 0, $or$cond$i = 0, $or$cond122 = 0, $or$cond15 = 0, $or$cond17 = 0, $or$cond18$i = 0, $or$cond20 = 0, $or$cond22$i = 0, $or$cond3$not$i = 0, $or$cond31$i = 0, $or$cond6$i = 0, $p$0 = 0, $p$0$ = 0;
 var $p$1 = 0, $p$2 = 0, $p$2$ = 0, $p$3 = 0, $p$4176 = 0, $p$5 = 0, $pl$0 = 0, $pl$0$i = 0, $pl$1 = 0, $pl$1$i = 0, $pl$2 = 0, $prefix$0 = 0, $prefix$0$$i = 0, $prefix$0$i = 0, $prefix$1 = 0, $prefix$2 = 0, $r$0$a$9$i = 0, $re$171$i = 0, $round$070$i = 0.0, $round6$1$i = 0.0;
 var $s$0 = 0, $s$0$i = 0, $s$01$i = 0, $s$1 = 0, $s$1$i = 0, $s$1$i5 = 0, $s$2$lcssa = 0, $s$292 = 0, $s$4 = 0, $s$6 = 0, $s$7 = 0, $s1$0$i = 0, $s7$081$i = 0, $s7$1$i = 0, $s8$0$lcssa$i = 0, $s8$072$i = 0, $s9$0$i = 0, $s9$185$i = 0, $s9$2$i = 0, $scevgep182$i = 0;
 var $scevgep182183$i = 0, $small$0$i = 0.0, $small$1$i = 0.0, $st$0 = 0, $storemerge = 0, $storemerge13 = 0, $storemerge851 = 0, $storemerge899 = 0, $sum = 0, $t$0 = 0, $t$1 = 0, $w$$i = 0, $w$0 = 0, $w$1 = 0, $w$2 = 0, $w$32$i = 0, $wc = 0, $ws$0106 = 0, $ws$1117 = 0, $z$0$i = 0;
 var $z$0$lcssa = 0, $z$093 = 0, $z$1 = 0, $z$1$lcssa$i = 0, $z$1148$i = 0, $z$2 = 0, $z$2$i = 0, $z$3$lcssa$i = 0, $z$3135$i = 0, $z$4$i = 0, $z$7$$i = 0, $z$7$i = 0, $z$7$ph$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 624|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $big$i = sp + 24|0;
 $e2$i = sp + 16|0;
 $buf$i = sp + 588|0;
 $ebuf0$i = sp + 576|0;
 $arg = sp;
 $buf = sp + 536|0;
 $wc = sp + 8|0;
 $mb = sp + 528|0;
 $0 = ($f|0)!=(0|0);
 $1 = ((($buf)) + 40|0);
 $2 = $1;
 $3 = ((($buf)) + 39|0);
 $4 = ((($wc)) + 4|0);
 $5 = $buf$i;
 $6 = (0 - ($5))|0;
 $7 = ((($ebuf0$i)) + 12|0);
 $8 = ((($ebuf0$i)) + 11|0);
 $9 = $7;
 $10 = (($9) - ($5))|0;
 $11 = (-2 - ($5))|0;
 $12 = (($9) + 2)|0;
 $13 = ((($big$i)) + 288|0);
 $14 = ((($buf$i)) + 9|0);
 $15 = $14;
 $16 = ((($buf$i)) + 8|0);
 $cnt$0 = 0;$l$0 = 0;$l10n$0 = 0;$s$0 = $fmt;
 L1: while(1) {
  $17 = ($cnt$0|0)>(-1);
  do {
   if ($17) {
    $18 = (2147483647 - ($cnt$0))|0;
    $19 = ($l$0|0)>($18|0);
    if (!($19)) {
     $25 = (($l$0) + ($cnt$0))|0;
     $cnt$1 = $25;
     break;
    }
    $20 = HEAP32[4331]|0;
    $21 = ($20|0)==(0|0);
    if ($21) {
     $$0$i1 = 17368;
    } else {
     $22 = (_pthread_self()|0);
     $23 = ((($22)) + 64|0);
     $24 = HEAP32[$23>>2]|0;
     $$0$i1 = $24;
    }
    HEAP32[$$0$i1>>2] = 75;
    $cnt$1 = -1;
   } else {
    $cnt$1 = $cnt$0;
   }
  } while(0);
  $26 = HEAP8[$s$0>>0]|0;
  $27 = ($26<<24>>24)==(0);
  if ($27) {
   label = 254;
   break;
  } else {
   $28 = $26;$s$1 = $s$0;
  }
  L12: while(1) {
   switch ($28<<24>>24) {
   case 37:  {
    $s$292 = $s$1;$z$093 = $s$1;
    label = 11;
    break L12;
    break;
   }
   case 0:  {
    $s$2$lcssa = $s$1;$z$0$lcssa = $s$1;
    break L12;
    break;
   }
   default: {
   }
   }
   $29 = ((($s$1)) + 1|0);
   $$pre = HEAP8[$29>>0]|0;
   $28 = $$pre;$s$1 = $29;
  }
  L15: do {
   if ((label|0) == 11) {
    while(1) {
     label = 0;
     $30 = ((($s$292)) + 1|0);
     $31 = HEAP8[$30>>0]|0;
     $32 = ($31<<24>>24)==(37);
     if (!($32)) {
      $s$2$lcssa = $s$292;$z$0$lcssa = $z$093;
      break L15;
     }
     $33 = ((($z$093)) + 1|0);
     $34 = ((($s$292)) + 2|0);
     $35 = HEAP8[$34>>0]|0;
     $36 = ($35<<24>>24)==(37);
     if ($36) {
      $s$292 = $34;$z$093 = $33;
      label = 11;
     } else {
      $s$2$lcssa = $34;$z$0$lcssa = $33;
      break;
     }
    }
   }
  } while(0);
  $37 = $z$0$lcssa;
  $38 = $s$0;
  $39 = (($37) - ($38))|0;
  if ($0) {
   $40 = HEAP32[$f>>2]|0;
   $41 = $40 & 32;
   $42 = ($41|0)==(0);
   if ($42) {
    ___fwritex($s$0,$39,$f);
   }
  }
  $43 = ($z$0$lcssa|0)==($s$0|0);
  if (!($43)) {
   $l10n$0$phi = $l10n$0;$cnt$0 = $cnt$1;$l$0 = $39;$s$0 = $s$2$lcssa;$l10n$0 = $l10n$0$phi;
   continue;
  }
  $44 = ((($s$2$lcssa)) + 1|0);
  $45 = HEAP8[$44>>0]|0;
  $46 = $45 << 24 >> 24;
  $isdigittmp = (($46) + -48)|0;
  $isdigit = ($isdigittmp>>>0)<(10);
  if ($isdigit) {
   $47 = ((($s$2$lcssa)) + 2|0);
   $48 = HEAP8[$47>>0]|0;
   $49 = ($48<<24>>24)==(36);
   $50 = ((($s$2$lcssa)) + 3|0);
   $$43 = $49 ? $50 : $44;
   $$l10n$0 = $49 ? 1 : $l10n$0;
   $isdigittmp$ = $49 ? $isdigittmp : -1;
   $$pre170 = HEAP8[$$43>>0]|0;
   $52 = $$pre170;$argpos$0 = $isdigittmp$;$l10n$1 = $$l10n$0;$storemerge = $$43;
  } else {
   $52 = $45;$argpos$0 = -1;$l10n$1 = $l10n$0;$storemerge = $44;
  }
  $51 = $52 << 24 >> 24;
  $53 = $51 & -32;
  $54 = ($53|0)==(32);
  L28: do {
   if ($54) {
    $56 = $51;$61 = $52;$fl$0100 = 0;$storemerge899 = $storemerge;
    while(1) {
     $55 = (($56) + -32)|0;
     $57 = 1 << $55;
     $58 = $57 & 75913;
     $59 = ($58|0)==(0);
     if ($59) {
      $71 = $61;$fl$053 = $fl$0100;$storemerge851 = $storemerge899;
      break L28;
     }
     $60 = $61 << 24 >> 24;
     $62 = (($60) + -32)|0;
     $63 = 1 << $62;
     $64 = $63 | $fl$0100;
     $65 = ((($storemerge899)) + 1|0);
     $66 = HEAP8[$65>>0]|0;
     $67 = $66 << 24 >> 24;
     $68 = $67 & -32;
     $69 = ($68|0)==(32);
     if ($69) {
      $56 = $67;$61 = $66;$fl$0100 = $64;$storemerge899 = $65;
     } else {
      $71 = $66;$fl$053 = $64;$storemerge851 = $65;
      break;
     }
    }
   } else {
    $71 = $52;$fl$053 = 0;$storemerge851 = $storemerge;
   }
  } while(0);
  $70 = ($71<<24>>24)==(42);
  do {
   if ($70) {
    $72 = ((($storemerge851)) + 1|0);
    $73 = HEAP8[$72>>0]|0;
    $74 = $73 << 24 >> 24;
    $isdigittmp11 = (($74) + -48)|0;
    $isdigit12 = ($isdigittmp11>>>0)<(10);
    if ($isdigit12) {
     $75 = ((($storemerge851)) + 2|0);
     $76 = HEAP8[$75>>0]|0;
     $77 = ($76<<24>>24)==(36);
     if ($77) {
      $78 = (($nl_type) + ($isdigittmp11<<2)|0);
      HEAP32[$78>>2] = 10;
      $79 = HEAP8[$72>>0]|0;
      $80 = $79 << 24 >> 24;
      $81 = (($80) + -48)|0;
      $82 = (($nl_arg) + ($81<<3)|0);
      $83 = $82;
      $84 = $83;
      $85 = HEAP32[$84>>2]|0;
      $86 = (($83) + 4)|0;
      $87 = $86;
      $88 = HEAP32[$87>>2]|0;
      $89 = ((($storemerge851)) + 3|0);
      $l10n$2 = 1;$storemerge13 = $89;$w$0 = $85;
     } else {
      label = 26;
     }
    } else {
     label = 26;
    }
    if ((label|0) == 26) {
     label = 0;
     $90 = ($l10n$1|0)==(0);
     if (!($90)) {
      $$0 = -1;
      break L1;
     }
     if (!($0)) {
      $fl$1 = $fl$053;$l10n$3 = 0;$s$4 = $72;$w$1 = 0;
      break;
     }
     $arglist_current = HEAP32[$ap>>2]|0;
     $91 = $arglist_current;
     $92 = ((0) + 4|0);
     $expanded4 = $92;
     $expanded = (($expanded4) - 1)|0;
     $93 = (($91) + ($expanded))|0;
     $94 = ((0) + 4|0);
     $expanded8 = $94;
     $expanded7 = (($expanded8) - 1)|0;
     $expanded6 = $expanded7 ^ -1;
     $95 = $93 & $expanded6;
     $96 = $95;
     $97 = HEAP32[$96>>2]|0;
     $arglist_next = ((($96)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next;
     $l10n$2 = 0;$storemerge13 = $72;$w$0 = $97;
    }
    $98 = ($w$0|0)<(0);
    if ($98) {
     $99 = $fl$053 | 8192;
     $100 = (0 - ($w$0))|0;
     $fl$1 = $99;$l10n$3 = $l10n$2;$s$4 = $storemerge13;$w$1 = $100;
    } else {
     $fl$1 = $fl$053;$l10n$3 = $l10n$2;$s$4 = $storemerge13;$w$1 = $w$0;
    }
   } else {
    $101 = $71 << 24 >> 24;
    $isdigittmp1$i = (($101) + -48)|0;
    $isdigit2$i = ($isdigittmp1$i>>>0)<(10);
    if ($isdigit2$i) {
     $105 = $storemerge851;$i$03$i = 0;$isdigittmp4$i = $isdigittmp1$i;
     while(1) {
      $102 = ($i$03$i*10)|0;
      $103 = (($102) + ($isdigittmp4$i))|0;
      $104 = ((($105)) + 1|0);
      $106 = HEAP8[$104>>0]|0;
      $107 = $106 << 24 >> 24;
      $isdigittmp$i = (($107) + -48)|0;
      $isdigit$i = ($isdigittmp$i>>>0)<(10);
      if ($isdigit$i) {
       $105 = $104;$i$03$i = $103;$isdigittmp4$i = $isdigittmp$i;
      } else {
       break;
      }
     }
     $108 = ($103|0)<(0);
     if ($108) {
      $$0 = -1;
      break L1;
     } else {
      $fl$1 = $fl$053;$l10n$3 = $l10n$1;$s$4 = $104;$w$1 = $103;
     }
    } else {
     $fl$1 = $fl$053;$l10n$3 = $l10n$1;$s$4 = $storemerge851;$w$1 = 0;
    }
   }
  } while(0);
  $109 = HEAP8[$s$4>>0]|0;
  $110 = ($109<<24>>24)==(46);
  L49: do {
   if ($110) {
    $111 = ((($s$4)) + 1|0);
    $112 = HEAP8[$111>>0]|0;
    $113 = ($112<<24>>24)==(42);
    if (!($113)) {
     $140 = $112 << 24 >> 24;
     $isdigittmp1$i22 = (($140) + -48)|0;
     $isdigit2$i23 = ($isdigittmp1$i22>>>0)<(10);
     if ($isdigit2$i23) {
      $144 = $111;$i$03$i25 = 0;$isdigittmp4$i24 = $isdigittmp1$i22;
     } else {
      $p$0 = 0;$s$6 = $111;
      break;
     }
     while(1) {
      $141 = ($i$03$i25*10)|0;
      $142 = (($141) + ($isdigittmp4$i24))|0;
      $143 = ((($144)) + 1|0);
      $145 = HEAP8[$143>>0]|0;
      $146 = $145 << 24 >> 24;
      $isdigittmp$i26 = (($146) + -48)|0;
      $isdigit$i27 = ($isdigittmp$i26>>>0)<(10);
      if ($isdigit$i27) {
       $144 = $143;$i$03$i25 = $142;$isdigittmp4$i24 = $isdigittmp$i26;
      } else {
       $p$0 = $142;$s$6 = $143;
       break L49;
      }
     }
    }
    $114 = ((($s$4)) + 2|0);
    $115 = HEAP8[$114>>0]|0;
    $116 = $115 << 24 >> 24;
    $isdigittmp9 = (($116) + -48)|0;
    $isdigit10 = ($isdigittmp9>>>0)<(10);
    if ($isdigit10) {
     $117 = ((($s$4)) + 3|0);
     $118 = HEAP8[$117>>0]|0;
     $119 = ($118<<24>>24)==(36);
     if ($119) {
      $120 = (($nl_type) + ($isdigittmp9<<2)|0);
      HEAP32[$120>>2] = 10;
      $121 = HEAP8[$114>>0]|0;
      $122 = $121 << 24 >> 24;
      $123 = (($122) + -48)|0;
      $124 = (($nl_arg) + ($123<<3)|0);
      $125 = $124;
      $126 = $125;
      $127 = HEAP32[$126>>2]|0;
      $128 = (($125) + 4)|0;
      $129 = $128;
      $130 = HEAP32[$129>>2]|0;
      $131 = ((($s$4)) + 4|0);
      $p$0 = $127;$s$6 = $131;
      break;
     }
    }
    $132 = ($l10n$3|0)==(0);
    if (!($132)) {
     $$0 = -1;
     break L1;
    }
    if ($0) {
     $arglist_current2 = HEAP32[$ap>>2]|0;
     $133 = $arglist_current2;
     $134 = ((0) + 4|0);
     $expanded11 = $134;
     $expanded10 = (($expanded11) - 1)|0;
     $135 = (($133) + ($expanded10))|0;
     $136 = ((0) + 4|0);
     $expanded15 = $136;
     $expanded14 = (($expanded15) - 1)|0;
     $expanded13 = $expanded14 ^ -1;
     $137 = $135 & $expanded13;
     $138 = $137;
     $139 = HEAP32[$138>>2]|0;
     $arglist_next3 = ((($138)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next3;
     $p$0 = $139;$s$6 = $114;
    } else {
     $p$0 = 0;$s$6 = $114;
    }
   } else {
    $p$0 = -1;$s$6 = $s$4;
   }
  } while(0);
  $s$7 = $s$6;$st$0 = 0;
  while(1) {
   $147 = HEAP8[$s$7>>0]|0;
   $148 = $147 << 24 >> 24;
   $149 = (($148) + -65)|0;
   $150 = ($149>>>0)>(57);
   if ($150) {
    $$0 = -1;
    break L1;
   }
   $151 = ((($s$7)) + 1|0);
   $152 = ((14636 + (($st$0*58)|0)|0) + ($149)|0);
   $153 = HEAP8[$152>>0]|0;
   $154 = $153&255;
   $155 = (($154) + -1)|0;
   $156 = ($155>>>0)<(8);
   if ($156) {
    $s$7 = $151;$st$0 = $154;
   } else {
    break;
   }
  }
  $157 = ($153<<24>>24)==(0);
  if ($157) {
   $$0 = -1;
   break;
  }
  $158 = ($153<<24>>24)==(19);
  $159 = ($argpos$0|0)>(-1);
  do {
   if ($158) {
    if ($159) {
     $$0 = -1;
     break L1;
    } else {
     label = 54;
    }
   } else {
    if ($159) {
     $160 = (($nl_type) + ($argpos$0<<2)|0);
     HEAP32[$160>>2] = $154;
     $161 = (($nl_arg) + ($argpos$0<<3)|0);
     $162 = $161;
     $163 = $162;
     $164 = HEAP32[$163>>2]|0;
     $165 = (($162) + 4)|0;
     $166 = $165;
     $167 = HEAP32[$166>>2]|0;
     $168 = $arg;
     $169 = $168;
     HEAP32[$169>>2] = $164;
     $170 = (($168) + 4)|0;
     $171 = $170;
     HEAP32[$171>>2] = $167;
     label = 54;
     break;
    }
    if (!($0)) {
     $$0 = 0;
     break L1;
    }
    _pop_arg($arg,$154,$ap);
   }
  } while(0);
  if ((label|0) == 54) {
   label = 0;
   if (!($0)) {
    $cnt$0 = $cnt$1;$l$0 = $39;$l10n$0 = $l10n$3;$s$0 = $151;
    continue;
   }
  }
  $172 = HEAP8[$s$7>>0]|0;
  $173 = $172 << 24 >> 24;
  $174 = ($st$0|0)!=(0);
  $175 = $173 & 15;
  $176 = ($175|0)==(3);
  $or$cond15 = $174 & $176;
  $177 = $173 & -33;
  $t$0 = $or$cond15 ? $177 : $173;
  $178 = $fl$1 & 8192;
  $179 = ($178|0)==(0);
  $180 = $fl$1 & -65537;
  $fl$1$ = $179 ? $fl$1 : $180;
  L78: do {
   switch ($t$0|0) {
   case 110:  {
    switch ($st$0|0) {
    case 0:  {
     $187 = HEAP32[$arg>>2]|0;
     HEAP32[$187>>2] = $cnt$1;
     $cnt$0 = $cnt$1;$l$0 = $39;$l10n$0 = $l10n$3;$s$0 = $151;
     continue L1;
     break;
    }
    case 1:  {
     $188 = HEAP32[$arg>>2]|0;
     HEAP32[$188>>2] = $cnt$1;
     $cnt$0 = $cnt$1;$l$0 = $39;$l10n$0 = $l10n$3;$s$0 = $151;
     continue L1;
     break;
    }
    case 2:  {
     $189 = ($cnt$1|0)<(0);
     $190 = $189 << 31 >> 31;
     $191 = HEAP32[$arg>>2]|0;
     $192 = $191;
     $193 = $192;
     HEAP32[$193>>2] = $cnt$1;
     $194 = (($192) + 4)|0;
     $195 = $194;
     HEAP32[$195>>2] = $190;
     $cnt$0 = $cnt$1;$l$0 = $39;$l10n$0 = $l10n$3;$s$0 = $151;
     continue L1;
     break;
    }
    case 3:  {
     $196 = $cnt$1&65535;
     $197 = HEAP32[$arg>>2]|0;
     HEAP16[$197>>1] = $196;
     $cnt$0 = $cnt$1;$l$0 = $39;$l10n$0 = $l10n$3;$s$0 = $151;
     continue L1;
     break;
    }
    case 4:  {
     $198 = $cnt$1&255;
     $199 = HEAP32[$arg>>2]|0;
     HEAP8[$199>>0] = $198;
     $cnt$0 = $cnt$1;$l$0 = $39;$l10n$0 = $l10n$3;$s$0 = $151;
     continue L1;
     break;
    }
    case 6:  {
     $200 = HEAP32[$arg>>2]|0;
     HEAP32[$200>>2] = $cnt$1;
     $cnt$0 = $cnt$1;$l$0 = $39;$l10n$0 = $l10n$3;$s$0 = $151;
     continue L1;
     break;
    }
    case 7:  {
     $201 = ($cnt$1|0)<(0);
     $202 = $201 << 31 >> 31;
     $203 = HEAP32[$arg>>2]|0;
     $204 = $203;
     $205 = $204;
     HEAP32[$205>>2] = $cnt$1;
     $206 = (($204) + 4)|0;
     $207 = $206;
     HEAP32[$207>>2] = $202;
     $cnt$0 = $cnt$1;$l$0 = $39;$l10n$0 = $l10n$3;$s$0 = $151;
     continue L1;
     break;
    }
    default: {
     $cnt$0 = $cnt$1;$l$0 = $39;$l10n$0 = $l10n$3;$s$0 = $151;
     continue L1;
    }
    }
    break;
   }
   case 112:  {
    $208 = ($p$0>>>0)>(8);
    $209 = $208 ? $p$0 : 8;
    $210 = $fl$1$ | 8;
    $fl$3 = $210;$p$1 = $209;$t$1 = 120;
    label = 66;
    break;
   }
   case 88: case 120:  {
    $fl$3 = $fl$1$;$p$1 = $p$0;$t$1 = $t$0;
    label = 66;
    break;
   }
   case 111:  {
    $248 = $arg;
    $249 = $248;
    $250 = HEAP32[$249>>2]|0;
    $251 = (($248) + 4)|0;
    $252 = $251;
    $253 = HEAP32[$252>>2]|0;
    $254 = ($250|0)==(0);
    $255 = ($253|0)==(0);
    $256 = $254 & $255;
    if ($256) {
     $$0$lcssa$i = $1;
    } else {
     $$03$i33 = $1;$258 = $250;$262 = $253;
     while(1) {
      $257 = $258 & 7;
      $259 = $257 | 48;
      $260 = $259&255;
      $261 = ((($$03$i33)) + -1|0);
      HEAP8[$261>>0] = $260;
      $263 = (_bitshift64Lshr(($258|0),($262|0),3)|0);
      $264 = tempRet0;
      $265 = ($263|0)==(0);
      $266 = ($264|0)==(0);
      $267 = $265 & $266;
      if ($267) {
       $$0$lcssa$i = $261;
       break;
      } else {
       $$03$i33 = $261;$258 = $263;$262 = $264;
      }
     }
    }
    $268 = $fl$1$ & 8;
    $269 = ($268|0)==(0);
    if ($269) {
     $a$0 = $$0$lcssa$i;$fl$4 = $fl$1$;$p$2 = $p$0;$pl$1 = 0;$prefix$1 = 15116;
     label = 79;
    } else {
     $270 = $$0$lcssa$i;
     $271 = (($2) - ($270))|0;
     $272 = ($p$0|0)>($271|0);
     $273 = (($271) + 1)|0;
     $p$0$ = $272 ? $p$0 : $273;
     $a$0 = $$0$lcssa$i;$fl$4 = $fl$1$;$p$2 = $p$0$;$pl$1 = 0;$prefix$1 = 15116;
     label = 79;
    }
    break;
   }
   case 105: case 100:  {
    $274 = $arg;
    $275 = $274;
    $276 = HEAP32[$275>>2]|0;
    $277 = (($274) + 4)|0;
    $278 = $277;
    $279 = HEAP32[$278>>2]|0;
    $280 = ($279|0)<(0);
    if ($280) {
     $281 = (_i64Subtract(0,0,($276|0),($279|0))|0);
     $282 = tempRet0;
     $283 = $arg;
     $284 = $283;
     HEAP32[$284>>2] = $281;
     $285 = (($283) + 4)|0;
     $286 = $285;
     HEAP32[$286>>2] = $282;
     $291 = $281;$292 = $282;$pl$0 = 1;$prefix$0 = 15116;
     label = 78;
     break L78;
    }
    $287 = $fl$1$ & 2048;
    $288 = ($287|0)==(0);
    if ($288) {
     $289 = $fl$1$ & 1;
     $290 = ($289|0)==(0);
     $$ = $290 ? 15116 : (15118);
     $291 = $276;$292 = $279;$pl$0 = $289;$prefix$0 = $$;
     label = 78;
    } else {
     $291 = $276;$292 = $279;$pl$0 = 1;$prefix$0 = (15117);
     label = 78;
    }
    break;
   }
   case 117:  {
    $181 = $arg;
    $182 = $181;
    $183 = HEAP32[$182>>2]|0;
    $184 = (($181) + 4)|0;
    $185 = $184;
    $186 = HEAP32[$185>>2]|0;
    $291 = $183;$292 = $186;$pl$0 = 0;$prefix$0 = 15116;
    label = 78;
    break;
   }
   case 99:  {
    $312 = $arg;
    $313 = $312;
    $314 = HEAP32[$313>>2]|0;
    $315 = (($312) + 4)|0;
    $316 = $315;
    $317 = HEAP32[$316>>2]|0;
    $318 = $314&255;
    HEAP8[$3>>0] = $318;
    $a$2 = $3;$fl$6 = $180;$p$5 = 1;$pl$2 = 0;$prefix$2 = 15116;$z$2 = $1;
    break;
   }
   case 109:  {
    $319 = HEAP32[4331]|0;
    $320 = ($319|0)==(0|0);
    if ($320) {
     $$0$i2 = 17368;
    } else {
     $321 = (_pthread_self()|0);
     $322 = ((($321)) + 64|0);
     $323 = HEAP32[$322>>2]|0;
     $$0$i2 = $323;
    }
    $324 = HEAP32[$$0$i2>>2]|0;
    $i$03$i4 = 0;
    while(1) {
     $326 = (15126 + ($i$03$i4)|0);
     $327 = HEAP8[$326>>0]|0;
     $328 = $327&255;
     $329 = ($328|0)==($324|0);
     if ($329) {
      label = 85;
      break;
     }
     $330 = (($i$03$i4) + 1)|0;
     $331 = ($330|0)==(87);
     if ($331) {
      $i$12$i = 87;$s$01$i = 15214;
      break;
     } else {
      $i$03$i4 = $330;
     }
    }
    if ((label|0) == 85) {
     label = 0;
     $325 = ($i$03$i4|0)==(0);
     if ($325) {
      $a$1 = 15214;
      label = 92;
      break L78;
     } else {
      $i$12$i = $i$03$i4;$s$01$i = 15214;
     }
    }
    while(1) {
     $s$1$i5 = $s$01$i;
     while(1) {
      $332 = HEAP8[$s$1$i5>>0]|0;
      $333 = ($332<<24>>24)==(0);
      $334 = ((($s$1$i5)) + 1|0);
      if ($333) {
       break;
      } else {
       $s$1$i5 = $334;
      }
     }
     $335 = (($i$12$i) + -1)|0;
     $336 = ($335|0)==(0);
     if ($336) {
      $a$1 = $334;
      label = 92;
      break;
     } else {
      $i$12$i = $335;$s$01$i = $334;
     }
    }
    break;
   }
   case 115:  {
    $337 = HEAP32[$arg>>2]|0;
    $338 = ($337|0)!=(0|0);
    $339 = $338 ? $337 : 17018;
    $a$1 = $339;
    label = 92;
    break;
   }
   case 67:  {
    $346 = $arg;
    $347 = $346;
    $348 = HEAP32[$347>>2]|0;
    $349 = (($346) + 4)|0;
    $350 = $349;
    $351 = HEAP32[$350>>2]|0;
    HEAP32[$wc>>2] = $348;
    HEAP32[$4>>2] = 0;
    HEAP32[$arg>>2] = $wc;
    $815 = $wc;$p$4176 = -1;
    label = 96;
    break;
   }
   case 83:  {
    $$pre171 = HEAP32[$arg>>2]|0;
    $352 = ($p$0|0)==(0);
    if ($352) {
     _pad($f,32,$w$1,0,$fl$1$);
     $i$0$lcssa178 = 0;
     label = 107;
    } else {
     $815 = $$pre171;$p$4176 = $p$0;
     label = 96;
    }
    break;
   }
   case 65: case 71: case 70: case 69: case 97: case 103: case 102: case 101:  {
    $377 = +HEAPF64[$arg>>3];
    HEAP32[$e2$i>>2] = 0;
    HEAPF64[tempDoublePtr>>3] = $377;$378 = HEAP32[tempDoublePtr>>2]|0;
    $379 = HEAP32[tempDoublePtr+4>>2]|0;
    $380 = ($379|0)<(0);
    if ($380) {
     $381 = -$377;
     $$07$i = $381;$pl$0$i = 1;$prefix$0$i = 17025;
    } else {
     $382 = $fl$1$ & 2048;
     $383 = ($382|0)==(0);
     if ($383) {
      $384 = $fl$1$ & 1;
      $385 = ($384|0)==(0);
      $$$i = $385 ? (17026) : (17031);
      $$07$i = $377;$pl$0$i = $384;$prefix$0$i = $$$i;
     } else {
      $$07$i = $377;$pl$0$i = 1;$prefix$0$i = (17028);
     }
    }
    HEAPF64[tempDoublePtr>>3] = $$07$i;$386 = HEAP32[tempDoublePtr>>2]|0;
    $387 = HEAP32[tempDoublePtr+4>>2]|0;
    $388 = $387 & 2146435072;
    $389 = ($388>>>0)<(2146435072);
    $390 = (0)<(0);
    $391 = ($388|0)==(2146435072);
    $392 = $391 & $390;
    $393 = $389 | $392;
    do {
     if ($393) {
      $409 = (+_frexp($$07$i,$e2$i));
      $410 = $409 * 2.0;
      $411 = $410 != 0.0;
      if ($411) {
       $412 = HEAP32[$e2$i>>2]|0;
       $413 = (($412) + -1)|0;
       HEAP32[$e2$i>>2] = $413;
      }
      $414 = $t$0 | 32;
      $415 = ($414|0)==(97);
      if ($415) {
       $416 = $t$0 & 32;
       $417 = ($416|0)==(0);
       $418 = ((($prefix$0$i)) + 9|0);
       $prefix$0$$i = $417 ? $prefix$0$i : $418;
       $419 = $pl$0$i | 2;
       $420 = ($p$0>>>0)>(11);
       $421 = (12 - ($p$0))|0;
       $422 = ($421|0)==(0);
       $423 = $420 | $422;
       do {
        if ($423) {
         $$1$i = $410;
        } else {
         $re$171$i = $421;$round$070$i = 8.0;
         while(1) {
          $424 = (($re$171$i) + -1)|0;
          $425 = $round$070$i * 16.0;
          $426 = ($424|0)==(0);
          if ($426) {
           break;
          } else {
           $re$171$i = $424;$round$070$i = $425;
          }
         }
         $427 = HEAP8[$prefix$0$$i>>0]|0;
         $428 = ($427<<24>>24)==(45);
         if ($428) {
          $429 = -$410;
          $430 = $429 - $425;
          $431 = $425 + $430;
          $432 = -$431;
          $$1$i = $432;
          break;
         } else {
          $433 = $410 + $425;
          $434 = $433 - $425;
          $$1$i = $434;
          break;
         }
        }
       } while(0);
       $435 = HEAP32[$e2$i>>2]|0;
       $436 = ($435|0)<(0);
       $437 = (0 - ($435))|0;
       $438 = $436 ? $437 : $435;
       $439 = ($438|0)<(0);
       $440 = $439 << 31 >> 31;
       $441 = (_fmt_u($438,$440,$7)|0);
       $442 = ($441|0)==($7|0);
       if ($442) {
        HEAP8[$8>>0] = 48;
        $estr$0$i = $8;
       } else {
        $estr$0$i = $441;
       }
       $443 = $435 >> 31;
       $444 = $443 & 2;
       $445 = (($444) + 43)|0;
       $446 = $445&255;
       $447 = ((($estr$0$i)) + -1|0);
       HEAP8[$447>>0] = $446;
       $448 = (($t$0) + 15)|0;
       $449 = $448&255;
       $450 = ((($estr$0$i)) + -2|0);
       HEAP8[$450>>0] = $449;
       $notrhs$i = ($p$0|0)<(1);
       $451 = $fl$1$ & 8;
       $452 = ($451|0)==(0);
       $$2$i = $$1$i;$s$0$i = $buf$i;
       while(1) {
        $453 = (~~(($$2$i)));
        $454 = (15100 + ($453)|0);
        $455 = HEAP8[$454>>0]|0;
        $456 = $455&255;
        $457 = $456 | $416;
        $458 = $457&255;
        $459 = ((($s$0$i)) + 1|0);
        HEAP8[$s$0$i>>0] = $458;
        $460 = (+($453|0));
        $461 = $$2$i - $460;
        $462 = $461 * 16.0;
        $463 = $459;
        $464 = (($463) - ($5))|0;
        $465 = ($464|0)==(1);
        do {
         if ($465) {
          $notlhs$i = $462 == 0.0;
          $or$cond3$not$i = $notrhs$i & $notlhs$i;
          $or$cond$i = $452 & $or$cond3$not$i;
          if ($or$cond$i) {
           $s$1$i = $459;
           break;
          }
          $466 = ((($s$0$i)) + 2|0);
          HEAP8[$459>>0] = 46;
          $s$1$i = $466;
         } else {
          $s$1$i = $459;
         }
        } while(0);
        $467 = $462 != 0.0;
        if ($467) {
         $$2$i = $462;$s$0$i = $s$1$i;
        } else {
         break;
        }
       }
       $468 = ($p$0|0)!=(0);
       $$pre188$i = $s$1$i;
       $469 = (($11) + ($$pre188$i))|0;
       $470 = ($469|0)<($p$0|0);
       $or$cond122 = $468 & $470;
       $471 = $450;
       $472 = (($12) + ($p$0))|0;
       $473 = (($472) - ($471))|0;
       $474 = (($10) - ($471))|0;
       $475 = (($474) + ($$pre188$i))|0;
       $l$0$i = $or$cond122 ? $473 : $475;
       $476 = (($l$0$i) + ($419))|0;
       _pad($f,32,$w$1,$476,$fl$1$);
       $477 = HEAP32[$f>>2]|0;
       $478 = $477 & 32;
       $479 = ($478|0)==(0);
       if ($479) {
        ___fwritex($prefix$0$$i,$419,$f);
       }
       $480 = $fl$1$ ^ 65536;
       _pad($f,48,$w$1,$476,$480);
       $481 = (($$pre188$i) - ($5))|0;
       $482 = HEAP32[$f>>2]|0;
       $483 = $482 & 32;
       $484 = ($483|0)==(0);
       if ($484) {
        ___fwritex($buf$i,$481,$f);
       }
       $485 = (($9) - ($471))|0;
       $sum = (($481) + ($485))|0;
       $486 = (($l$0$i) - ($sum))|0;
       _pad($f,48,$486,0,0);
       $487 = HEAP32[$f>>2]|0;
       $488 = $487 & 32;
       $489 = ($488|0)==(0);
       if ($489) {
        ___fwritex($450,$485,$f);
       }
       $490 = $fl$1$ ^ 8192;
       _pad($f,32,$w$1,$476,$490);
       $491 = ($476|0)<($w$1|0);
       $w$$i = $491 ? $w$1 : $476;
       $$0$i = $w$$i;
       break;
      }
      $492 = ($p$0|0)<(0);
      $$p$i = $492 ? 6 : $p$0;
      if ($411) {
       $493 = $410 * 268435456.0;
       $494 = HEAP32[$e2$i>>2]|0;
       $495 = (($494) + -28)|0;
       HEAP32[$e2$i>>2] = $495;
       $$3$i = $493;$497 = $495;
      } else {
       $$pre185$i = HEAP32[$e2$i>>2]|0;
       $$3$i = $410;$497 = $$pre185$i;
      }
      $496 = ($497|0)<(0);
      $$33$i = $496 ? $big$i : $13;
      $498 = $$33$i;
      $$4$i = $$3$i;$z$0$i = $$33$i;
      while(1) {
       $499 = (~~(($$4$i))>>>0);
       HEAP32[$z$0$i>>2] = $499;
       $500 = ((($z$0$i)) + 4|0);
       $501 = (+($499>>>0));
       $502 = $$4$i - $501;
       $503 = $502 * 1.0E+9;
       $504 = $503 != 0.0;
       if ($504) {
        $$4$i = $503;$z$0$i = $500;
       } else {
        break;
       }
      }
      $$pr$i = HEAP32[$e2$i>>2]|0;
      $505 = ($$pr$i|0)>(0);
      if ($505) {
       $507 = $$pr$i;$a$1149$i = $$33$i;$z$1148$i = $500;
       while(1) {
        $506 = ($507|0)>(29);
        $508 = $506 ? 29 : $507;
        $d$0141$i = ((($z$1148$i)) + -4|0);
        $509 = ($d$0141$i>>>0)<($a$1149$i>>>0);
        do {
         if ($509) {
          $a$2$ph$i = $a$1149$i;
         } else {
          $carry$0142$i = 0;$d$0143$i = $d$0141$i;
          while(1) {
           $510 = HEAP32[$d$0143$i>>2]|0;
           $511 = (_bitshift64Shl(($510|0),0,($508|0))|0);
           $512 = tempRet0;
           $513 = (_i64Add(($511|0),($512|0),($carry$0142$i|0),0)|0);
           $514 = tempRet0;
           $515 = (___uremdi3(($513|0),($514|0),1000000000,0)|0);
           $516 = tempRet0;
           HEAP32[$d$0143$i>>2] = $515;
           $517 = (___udivdi3(($513|0),($514|0),1000000000,0)|0);
           $518 = tempRet0;
           $d$0$i = ((($d$0143$i)) + -4|0);
           $519 = ($d$0$i>>>0)<($a$1149$i>>>0);
           if ($519) {
            break;
           } else {
            $carry$0142$i = $517;$d$0143$i = $d$0$i;
           }
          }
          $520 = ($517|0)==(0);
          if ($520) {
           $a$2$ph$i = $a$1149$i;
           break;
          }
          $521 = ((($a$1149$i)) + -4|0);
          HEAP32[$521>>2] = $517;
          $a$2$ph$i = $521;
         }
        } while(0);
        $z$2$i = $z$1148$i;
        while(1) {
         $522 = ($z$2$i>>>0)>($a$2$ph$i>>>0);
         if (!($522)) {
          break;
         }
         $523 = ((($z$2$i)) + -4|0);
         $524 = HEAP32[$523>>2]|0;
         $525 = ($524|0)==(0);
         if ($525) {
          $z$2$i = $523;
         } else {
          break;
         }
        }
        $526 = HEAP32[$e2$i>>2]|0;
        $527 = (($526) - ($508))|0;
        HEAP32[$e2$i>>2] = $527;
        $528 = ($527|0)>(0);
        if ($528) {
         $507 = $527;$a$1149$i = $a$2$ph$i;$z$1148$i = $z$2$i;
        } else {
         $$pr50$i = $527;$a$1$lcssa$i = $a$2$ph$i;$z$1$lcssa$i = $z$2$i;
         break;
        }
       }
      } else {
       $$pr50$i = $$pr$i;$a$1$lcssa$i = $$33$i;$z$1$lcssa$i = $500;
      }
      $529 = ($$pr50$i|0)<(0);
      if ($529) {
       $530 = (($$p$i) + 25)|0;
       $531 = (($530|0) / 9)&-1;
       $532 = (($531) + 1)|0;
       $533 = ($414|0)==(102);
       $535 = $$pr50$i;$a$3136$i = $a$1$lcssa$i;$z$3135$i = $z$1$lcssa$i;
       while(1) {
        $534 = (0 - ($535))|0;
        $536 = ($534|0)>(9);
        $537 = $536 ? 9 : $534;
        $538 = ($a$3136$i>>>0)<($z$3135$i>>>0);
        do {
         if ($538) {
          $542 = 1 << $537;
          $543 = (($542) + -1)|0;
          $544 = 1000000000 >>> $537;
          $carry3$0130$i = 0;$d$1129$i = $a$3136$i;
          while(1) {
           $545 = HEAP32[$d$1129$i>>2]|0;
           $546 = $545 & $543;
           $547 = $545 >>> $537;
           $548 = (($547) + ($carry3$0130$i))|0;
           HEAP32[$d$1129$i>>2] = $548;
           $549 = Math_imul($546, $544)|0;
           $550 = ((($d$1129$i)) + 4|0);
           $551 = ($550>>>0)<($z$3135$i>>>0);
           if ($551) {
            $carry3$0130$i = $549;$d$1129$i = $550;
           } else {
            break;
           }
          }
          $552 = HEAP32[$a$3136$i>>2]|0;
          $553 = ($552|0)==(0);
          $554 = ((($a$3136$i)) + 4|0);
          $$a$3$i = $553 ? $554 : $a$3136$i;
          $555 = ($549|0)==(0);
          if ($555) {
           $$a$3192$i = $$a$3$i;$z$4$i = $z$3135$i;
           break;
          }
          $556 = ((($z$3135$i)) + 4|0);
          HEAP32[$z$3135$i>>2] = $549;
          $$a$3192$i = $$a$3$i;$z$4$i = $556;
         } else {
          $539 = HEAP32[$a$3136$i>>2]|0;
          $540 = ($539|0)==(0);
          $541 = ((($a$3136$i)) + 4|0);
          $$a$3191$i = $540 ? $541 : $a$3136$i;
          $$a$3192$i = $$a$3191$i;$z$4$i = $z$3135$i;
         }
        } while(0);
        $557 = $533 ? $$33$i : $$a$3192$i;
        $558 = $z$4$i;
        $559 = $557;
        $560 = (($558) - ($559))|0;
        $561 = $560 >> 2;
        $562 = ($561|0)>($532|0);
        $563 = (($557) + ($532<<2)|0);
        $$z$4$i = $562 ? $563 : $z$4$i;
        $564 = HEAP32[$e2$i>>2]|0;
        $565 = (($564) + ($537))|0;
        HEAP32[$e2$i>>2] = $565;
        $566 = ($565|0)<(0);
        if ($566) {
         $535 = $565;$a$3136$i = $$a$3192$i;$z$3135$i = $$z$4$i;
        } else {
         $a$3$lcssa$i = $$a$3192$i;$z$3$lcssa$i = $$z$4$i;
         break;
        }
       }
      } else {
       $a$3$lcssa$i = $a$1$lcssa$i;$z$3$lcssa$i = $z$1$lcssa$i;
      }
      $567 = ($a$3$lcssa$i>>>0)<($z$3$lcssa$i>>>0);
      do {
       if ($567) {
        $568 = $a$3$lcssa$i;
        $569 = (($498) - ($568))|0;
        $570 = $569 >> 2;
        $571 = ($570*9)|0;
        $572 = HEAP32[$a$3$lcssa$i>>2]|0;
        $573 = ($572>>>0)<(10);
        if ($573) {
         $e$1$i = $571;
         break;
        } else {
         $e$0125$i = $571;$i$0124$i = 10;
        }
        while(1) {
         $574 = ($i$0124$i*10)|0;
         $575 = (($e$0125$i) + 1)|0;
         $576 = ($572>>>0)<($574>>>0);
         if ($576) {
          $e$1$i = $575;
          break;
         } else {
          $e$0125$i = $575;$i$0124$i = $574;
         }
        }
       } else {
        $e$1$i = 0;
       }
      } while(0);
      $577 = ($414|0)!=(102);
      $578 = $577 ? $e$1$i : 0;
      $579 = (($$p$i) - ($578))|0;
      $580 = ($414|0)==(103);
      $581 = ($$p$i|0)!=(0);
      $582 = $581 & $580;
      $$neg55$i = $582 << 31 >> 31;
      $583 = (($579) + ($$neg55$i))|0;
      $584 = $z$3$lcssa$i;
      $585 = (($584) - ($498))|0;
      $586 = $585 >> 2;
      $587 = ($586*9)|0;
      $588 = (($587) + -9)|0;
      $589 = ($583|0)<($588|0);
      if ($589) {
       $590 = ((($$33$i)) + 4|0);
       $591 = (($583) + 9216)|0;
       $592 = (($591|0) / 9)&-1;
       $593 = (($592) + -1024)|0;
       $594 = (($590) + ($593<<2)|0);
       $595 = (($591|0) % 9)&-1;
       $j$0117$i = (($595) + 1)|0;
       $596 = ($j$0117$i|0)<(9);
       if ($596) {
        $i$1118$i = 10;$j$0119$i = $j$0117$i;
        while(1) {
         $597 = ($i$1118$i*10)|0;
         $j$0$i = (($j$0119$i) + 1)|0;
         $exitcond$i = ($j$0$i|0)==(9);
         if ($exitcond$i) {
          $i$1$lcssa$i = $597;
          break;
         } else {
          $i$1118$i = $597;$j$0119$i = $j$0$i;
         }
        }
       } else {
        $i$1$lcssa$i = 10;
       }
       $598 = HEAP32[$594>>2]|0;
       $599 = (($598>>>0) % ($i$1$lcssa$i>>>0))&-1;
       $600 = ($599|0)==(0);
       $601 = ((($594)) + 4|0);
       $602 = ($601|0)==($z$3$lcssa$i|0);
       $or$cond18$i = $602 & $600;
       do {
        if ($or$cond18$i) {
         $a$8$i = $a$3$lcssa$i;$d$4$i = $594;$e$4$i = $e$1$i;
        } else {
         $603 = (($598>>>0) / ($i$1$lcssa$i>>>0))&-1;
         $604 = $603 & 1;
         $605 = ($604|0)==(0);
         $$20$i = $605 ? 9007199254740992.0 : 9007199254740994.0;
         $606 = (($i$1$lcssa$i|0) / 2)&-1;
         $607 = ($599>>>0)<($606>>>0);
         if ($607) {
          $small$0$i = 0.5;
         } else {
          $608 = ($599|0)==($606|0);
          $or$cond22$i = $602 & $608;
          $$36$i = $or$cond22$i ? 1.0 : 1.5;
          $small$0$i = $$36$i;
         }
         $609 = ($pl$0$i|0)==(0);
         do {
          if ($609) {
           $round6$1$i = $$20$i;$small$1$i = $small$0$i;
          } else {
           $610 = HEAP8[$prefix$0$i>>0]|0;
           $611 = ($610<<24>>24)==(45);
           if (!($611)) {
            $round6$1$i = $$20$i;$small$1$i = $small$0$i;
            break;
           }
           $612 = -$$20$i;
           $613 = -$small$0$i;
           $round6$1$i = $612;$small$1$i = $613;
          }
         } while(0);
         $614 = (($598) - ($599))|0;
         HEAP32[$594>>2] = $614;
         $615 = $round6$1$i + $small$1$i;
         $616 = $615 != $round6$1$i;
         if (!($616)) {
          $a$8$i = $a$3$lcssa$i;$d$4$i = $594;$e$4$i = $e$1$i;
          break;
         }
         $617 = (($614) + ($i$1$lcssa$i))|0;
         HEAP32[$594>>2] = $617;
         $618 = ($617>>>0)>(999999999);
         if ($618) {
          $a$5111$i = $a$3$lcssa$i;$d$2110$i = $594;
          while(1) {
           $619 = ((($d$2110$i)) + -4|0);
           HEAP32[$d$2110$i>>2] = 0;
           $620 = ($619>>>0)<($a$5111$i>>>0);
           if ($620) {
            $621 = ((($a$5111$i)) + -4|0);
            HEAP32[$621>>2] = 0;
            $a$6$i = $621;
           } else {
            $a$6$i = $a$5111$i;
           }
           $622 = HEAP32[$619>>2]|0;
           $623 = (($622) + 1)|0;
           HEAP32[$619>>2] = $623;
           $624 = ($623>>>0)>(999999999);
           if ($624) {
            $a$5111$i = $a$6$i;$d$2110$i = $619;
           } else {
            $a$5$lcssa$i = $a$6$i;$d$2$lcssa$i = $619;
            break;
           }
          }
         } else {
          $a$5$lcssa$i = $a$3$lcssa$i;$d$2$lcssa$i = $594;
         }
         $625 = $a$5$lcssa$i;
         $626 = (($498) - ($625))|0;
         $627 = $626 >> 2;
         $628 = ($627*9)|0;
         $629 = HEAP32[$a$5$lcssa$i>>2]|0;
         $630 = ($629>>>0)<(10);
         if ($630) {
          $a$8$i = $a$5$lcssa$i;$d$4$i = $d$2$lcssa$i;$e$4$i = $628;
          break;
         } else {
          $e$2106$i = $628;$i$2105$i = 10;
         }
         while(1) {
          $631 = ($i$2105$i*10)|0;
          $632 = (($e$2106$i) + 1)|0;
          $633 = ($629>>>0)<($631>>>0);
          if ($633) {
           $a$8$i = $a$5$lcssa$i;$d$4$i = $d$2$lcssa$i;$e$4$i = $632;
           break;
          } else {
           $e$2106$i = $632;$i$2105$i = $631;
          }
         }
        }
       } while(0);
       $634 = ((($d$4$i)) + 4|0);
       $635 = ($z$3$lcssa$i>>>0)>($634>>>0);
       $$z$3$i = $635 ? $634 : $z$3$lcssa$i;
       $a$9$ph$i = $a$8$i;$e$5$ph$i = $e$4$i;$z$7$ph$i = $$z$3$i;
      } else {
       $a$9$ph$i = $a$3$lcssa$i;$e$5$ph$i = $e$1$i;$z$7$ph$i = $z$3$lcssa$i;
      }
      $636 = (0 - ($e$5$ph$i))|0;
      $z$7$i = $z$7$ph$i;
      while(1) {
       $637 = ($z$7$i>>>0)>($a$9$ph$i>>>0);
       if (!($637)) {
        $$lcssa162$i = 0;
        break;
       }
       $638 = ((($z$7$i)) + -4|0);
       $639 = HEAP32[$638>>2]|0;
       $640 = ($639|0)==(0);
       if ($640) {
        $z$7$i = $638;
       } else {
        $$lcssa162$i = 1;
        break;
       }
      }
      do {
       if ($580) {
        $641 = $581&1;
        $642 = $641 ^ 1;
        $$p$$i = (($642) + ($$p$i))|0;
        $643 = ($$p$$i|0)>($e$5$ph$i|0);
        $644 = ($e$5$ph$i|0)>(-5);
        $or$cond6$i = $643 & $644;
        if ($or$cond6$i) {
         $645 = (($t$0) + -1)|0;
         $$neg56$i = (($$p$$i) + -1)|0;
         $646 = (($$neg56$i) - ($e$5$ph$i))|0;
         $$013$i = $645;$$210$i = $646;
        } else {
         $647 = (($t$0) + -2)|0;
         $648 = (($$p$$i) + -1)|0;
         $$013$i = $647;$$210$i = $648;
        }
        $649 = $fl$1$ & 8;
        $650 = ($649|0)==(0);
        if (!($650)) {
         $$114$i = $$013$i;$$311$i = $$210$i;$$pre$phi190$iZ2D = $649;
         break;
        }
        do {
         if ($$lcssa162$i) {
          $651 = ((($z$7$i)) + -4|0);
          $652 = HEAP32[$651>>2]|0;
          $653 = ($652|0)==(0);
          if ($653) {
           $j$2$i = 9;
           break;
          }
          $654 = (($652>>>0) % 10)&-1;
          $655 = ($654|0)==(0);
          if ($655) {
           $i$3101$i = 10;$j$1102$i = 0;
          } else {
           $j$2$i = 0;
           break;
          }
          while(1) {
           $656 = ($i$3101$i*10)|0;
           $657 = (($j$1102$i) + 1)|0;
           $658 = (($652>>>0) % ($656>>>0))&-1;
           $659 = ($658|0)==(0);
           if ($659) {
            $i$3101$i = $656;$j$1102$i = $657;
           } else {
            $j$2$i = $657;
            break;
           }
          }
         } else {
          $j$2$i = 9;
         }
        } while(0);
        $660 = $$013$i | 32;
        $661 = ($660|0)==(102);
        $662 = $z$7$i;
        $663 = (($662) - ($498))|0;
        $664 = $663 >> 2;
        $665 = ($664*9)|0;
        $666 = (($665) + -9)|0;
        if ($661) {
         $667 = (($666) - ($j$2$i))|0;
         $668 = ($667|0)<(0);
         $$23$i = $668 ? 0 : $667;
         $669 = ($$210$i|0)<($$23$i|0);
         $$210$$24$i = $669 ? $$210$i : $$23$i;
         $$114$i = $$013$i;$$311$i = $$210$$24$i;$$pre$phi190$iZ2D = 0;
         break;
        } else {
         $670 = (($666) + ($e$5$ph$i))|0;
         $671 = (($670) - ($j$2$i))|0;
         $672 = ($671|0)<(0);
         $$25$i = $672 ? 0 : $671;
         $673 = ($$210$i|0)<($$25$i|0);
         $$210$$26$i = $673 ? $$210$i : $$25$i;
         $$114$i = $$013$i;$$311$i = $$210$$26$i;$$pre$phi190$iZ2D = 0;
         break;
        }
       } else {
        $$pre189$i = $fl$1$ & 8;
        $$114$i = $t$0;$$311$i = $$p$i;$$pre$phi190$iZ2D = $$pre189$i;
       }
      } while(0);
      $674 = $$311$i | $$pre$phi190$iZ2D;
      $675 = ($674|0)!=(0);
      $676 = $675&1;
      $677 = $$114$i | 32;
      $678 = ($677|0)==(102);
      if ($678) {
       $679 = ($e$5$ph$i|0)>(0);
       $680 = $679 ? $e$5$ph$i : 0;
       $$pn$i = $680;$estr$2$i = 0;
      } else {
       $681 = ($e$5$ph$i|0)<(0);
       $682 = $681 ? $636 : $e$5$ph$i;
       $683 = ($682|0)<(0);
       $684 = $683 << 31 >> 31;
       $685 = (_fmt_u($682,$684,$7)|0);
       $686 = $685;
       $687 = (($9) - ($686))|0;
       $688 = ($687|0)<(2);
       if ($688) {
        $estr$195$i = $685;
        while(1) {
         $689 = ((($estr$195$i)) + -1|0);
         HEAP8[$689>>0] = 48;
         $690 = $689;
         $691 = (($9) - ($690))|0;
         $692 = ($691|0)<(2);
         if ($692) {
          $estr$195$i = $689;
         } else {
          $estr$1$lcssa$i = $689;
          break;
         }
        }
       } else {
        $estr$1$lcssa$i = $685;
       }
       $693 = $e$5$ph$i >> 31;
       $694 = $693 & 2;
       $695 = (($694) + 43)|0;
       $696 = $695&255;
       $697 = ((($estr$1$lcssa$i)) + -1|0);
       HEAP8[$697>>0] = $696;
       $698 = $$114$i&255;
       $699 = ((($estr$1$lcssa$i)) + -2|0);
       HEAP8[$699>>0] = $698;
       $700 = $699;
       $701 = (($9) - ($700))|0;
       $$pn$i = $701;$estr$2$i = $699;
      }
      $702 = (($pl$0$i) + 1)|0;
      $703 = (($702) + ($$311$i))|0;
      $l$1$i = (($703) + ($676))|0;
      $704 = (($l$1$i) + ($$pn$i))|0;
      _pad($f,32,$w$1,$704,$fl$1$);
      $705 = HEAP32[$f>>2]|0;
      $706 = $705 & 32;
      $707 = ($706|0)==(0);
      if ($707) {
       ___fwritex($prefix$0$i,$pl$0$i,$f);
      }
      $708 = $fl$1$ ^ 65536;
      _pad($f,48,$w$1,$704,$708);
      do {
       if ($678) {
        $709 = ($a$9$ph$i>>>0)>($$33$i>>>0);
        $r$0$a$9$i = $709 ? $$33$i : $a$9$ph$i;
        $d$584$i = $r$0$a$9$i;
        while(1) {
         $710 = HEAP32[$d$584$i>>2]|0;
         $711 = (_fmt_u($710,0,$14)|0);
         $712 = ($d$584$i|0)==($r$0$a$9$i|0);
         do {
          if ($712) {
           $718 = ($711|0)==($14|0);
           if (!($718)) {
            $s7$1$i = $711;
            break;
           }
           HEAP8[$16>>0] = 48;
           $s7$1$i = $16;
          } else {
           $713 = ($711>>>0)>($buf$i>>>0);
           if (!($713)) {
            $s7$1$i = $711;
            break;
           }
           $714 = $711;
           $715 = (($714) - ($5))|0;
           _memset(($buf$i|0),48,($715|0))|0;
           $s7$081$i = $711;
           while(1) {
            $716 = ((($s7$081$i)) + -1|0);
            $717 = ($716>>>0)>($buf$i>>>0);
            if ($717) {
             $s7$081$i = $716;
            } else {
             $s7$1$i = $716;
             break;
            }
           }
          }
         } while(0);
         $719 = HEAP32[$f>>2]|0;
         $720 = $719 & 32;
         $721 = ($720|0)==(0);
         if ($721) {
          $722 = $s7$1$i;
          $723 = (($15) - ($722))|0;
          ___fwritex($s7$1$i,$723,$f);
         }
         $724 = ((($d$584$i)) + 4|0);
         $725 = ($724>>>0)>($$33$i>>>0);
         if ($725) {
          break;
         } else {
          $d$584$i = $724;
         }
        }
        $726 = ($674|0)==(0);
        do {
         if (!($726)) {
          $727 = HEAP32[$f>>2]|0;
          $728 = $727 & 32;
          $729 = ($728|0)==(0);
          if (!($729)) {
           break;
          }
          ___fwritex(17060,1,$f);
         }
        } while(0);
        $730 = ($724>>>0)<($z$7$i>>>0);
        $731 = ($$311$i|0)>(0);
        $732 = $731 & $730;
        if ($732) {
         $$41278$i = $$311$i;$d$677$i = $724;
         while(1) {
          $733 = HEAP32[$d$677$i>>2]|0;
          $734 = (_fmt_u($733,0,$14)|0);
          $735 = ($734>>>0)>($buf$i>>>0);
          if ($735) {
           $736 = $734;
           $737 = (($736) - ($5))|0;
           _memset(($buf$i|0),48,($737|0))|0;
           $s8$072$i = $734;
           while(1) {
            $738 = ((($s8$072$i)) + -1|0);
            $739 = ($738>>>0)>($buf$i>>>0);
            if ($739) {
             $s8$072$i = $738;
            } else {
             $s8$0$lcssa$i = $738;
             break;
            }
           }
          } else {
           $s8$0$lcssa$i = $734;
          }
          $740 = HEAP32[$f>>2]|0;
          $741 = $740 & 32;
          $742 = ($741|0)==(0);
          if ($742) {
           $743 = ($$41278$i|0)>(9);
           $744 = $743 ? 9 : $$41278$i;
           ___fwritex($s8$0$lcssa$i,$744,$f);
          }
          $745 = ((($d$677$i)) + 4|0);
          $746 = (($$41278$i) + -9)|0;
          $747 = ($745>>>0)<($z$7$i>>>0);
          $748 = ($$41278$i|0)>(9);
          $749 = $748 & $747;
          if ($749) {
           $$41278$i = $746;$d$677$i = $745;
          } else {
           $$412$lcssa$i = $746;
           break;
          }
         }
        } else {
         $$412$lcssa$i = $$311$i;
        }
        $750 = (($$412$lcssa$i) + 9)|0;
        _pad($f,48,$750,9,0);
       } else {
        $751 = ((($a$9$ph$i)) + 4|0);
        $z$7$$i = $$lcssa162$i ? $z$7$i : $751;
        $752 = ($$311$i|0)>(-1);
        if ($752) {
         $753 = ($$pre$phi190$iZ2D|0)==(0);
         $$589$i = $$311$i;$d$788$i = $a$9$ph$i;
         while(1) {
          $754 = HEAP32[$d$788$i>>2]|0;
          $755 = (_fmt_u($754,0,$14)|0);
          $756 = ($755|0)==($14|0);
          if ($756) {
           HEAP8[$16>>0] = 48;
           $s9$0$i = $16;
          } else {
           $s9$0$i = $755;
          }
          $757 = ($d$788$i|0)==($a$9$ph$i|0);
          do {
           if ($757) {
            $761 = ((($s9$0$i)) + 1|0);
            $762 = HEAP32[$f>>2]|0;
            $763 = $762 & 32;
            $764 = ($763|0)==(0);
            if ($764) {
             ___fwritex($s9$0$i,1,$f);
            }
            $765 = ($$589$i|0)<(1);
            $or$cond31$i = $753 & $765;
            if ($or$cond31$i) {
             $s9$2$i = $761;
             break;
            }
            $766 = HEAP32[$f>>2]|0;
            $767 = $766 & 32;
            $768 = ($767|0)==(0);
            if (!($768)) {
             $s9$2$i = $761;
             break;
            }
            ___fwritex(17060,1,$f);
            $s9$2$i = $761;
           } else {
            $758 = ($s9$0$i>>>0)>($buf$i>>>0);
            if (!($758)) {
             $s9$2$i = $s9$0$i;
             break;
            }
            $scevgep182$i = (($s9$0$i) + ($6)|0);
            $scevgep182183$i = $scevgep182$i;
            _memset(($buf$i|0),48,($scevgep182183$i|0))|0;
            $s9$185$i = $s9$0$i;
            while(1) {
             $759 = ((($s9$185$i)) + -1|0);
             $760 = ($759>>>0)>($buf$i>>>0);
             if ($760) {
              $s9$185$i = $759;
             } else {
              $s9$2$i = $759;
              break;
             }
            }
           }
          } while(0);
          $769 = $s9$2$i;
          $770 = (($15) - ($769))|0;
          $771 = HEAP32[$f>>2]|0;
          $772 = $771 & 32;
          $773 = ($772|0)==(0);
          if ($773) {
           $774 = ($$589$i|0)>($770|0);
           $775 = $774 ? $770 : $$589$i;
           ___fwritex($s9$2$i,$775,$f);
          }
          $776 = (($$589$i) - ($770))|0;
          $777 = ((($d$788$i)) + 4|0);
          $778 = ($777>>>0)<($z$7$$i>>>0);
          $779 = ($776|0)>(-1);
          $780 = $778 & $779;
          if ($780) {
           $$589$i = $776;$d$788$i = $777;
          } else {
           $$5$lcssa$i = $776;
           break;
          }
         }
        } else {
         $$5$lcssa$i = $$311$i;
        }
        $781 = (($$5$lcssa$i) + 18)|0;
        _pad($f,48,$781,18,0);
        $782 = HEAP32[$f>>2]|0;
        $783 = $782 & 32;
        $784 = ($783|0)==(0);
        if (!($784)) {
         break;
        }
        $785 = $estr$2$i;
        $786 = (($9) - ($785))|0;
        ___fwritex($estr$2$i,$786,$f);
       }
      } while(0);
      $787 = $fl$1$ ^ 8192;
      _pad($f,32,$w$1,$704,$787);
      $788 = ($704|0)<($w$1|0);
      $w$32$i = $788 ? $w$1 : $704;
      $$0$i = $w$32$i;
     } else {
      $394 = $t$0 & 32;
      $395 = ($394|0)!=(0);
      $396 = $395 ? 17044 : 17048;
      $397 = ($$07$i != $$07$i) | (0.0 != 0.0);
      $398 = $395 ? 17052 : 17056;
      $pl$1$i = $397 ? 0 : $pl$0$i;
      $s1$0$i = $397 ? $398 : $396;
      $399 = (($pl$1$i) + 3)|0;
      _pad($f,32,$w$1,$399,$180);
      $400 = HEAP32[$f>>2]|0;
      $401 = $400 & 32;
      $402 = ($401|0)==(0);
      if ($402) {
       ___fwritex($prefix$0$i,$pl$1$i,$f);
       $$pre$i = HEAP32[$f>>2]|0;
       $404 = $$pre$i;
      } else {
       $404 = $400;
      }
      $403 = $404 & 32;
      $405 = ($403|0)==(0);
      if ($405) {
       ___fwritex($s1$0$i,3,$f);
      }
      $406 = $fl$1$ ^ 8192;
      _pad($f,32,$w$1,$399,$406);
      $407 = ($399|0)<($w$1|0);
      $408 = $407 ? $w$1 : $399;
      $$0$i = $408;
     }
    } while(0);
    $cnt$0 = $cnt$1;$l$0 = $$0$i;$l10n$0 = $l10n$3;$s$0 = $151;
    continue L1;
    break;
   }
   default: {
    $a$2 = $s$0;$fl$6 = $fl$1$;$p$5 = $p$0;$pl$2 = 0;$prefix$2 = 15116;$z$2 = $1;
   }
   }
  } while(0);
  L327: do {
   if ((label|0) == 66) {
    label = 0;
    $211 = $arg;
    $212 = $211;
    $213 = HEAP32[$212>>2]|0;
    $214 = (($211) + 4)|0;
    $215 = $214;
    $216 = HEAP32[$215>>2]|0;
    $217 = $t$1 & 32;
    $218 = ($213|0)==(0);
    $219 = ($216|0)==(0);
    $220 = $218 & $219;
    if ($220) {
     $a$0 = $1;$fl$4 = $fl$3;$p$2 = $p$1;$pl$1 = 0;$prefix$1 = 15116;
     label = 79;
    } else {
     $$012$i = $1;$222 = $213;$229 = $216;
     while(1) {
      $221 = $222 & 15;
      $223 = (15100 + ($221)|0);
      $224 = HEAP8[$223>>0]|0;
      $225 = $224&255;
      $226 = $225 | $217;
      $227 = $226&255;
      $228 = ((($$012$i)) + -1|0);
      HEAP8[$228>>0] = $227;
      $230 = (_bitshift64Lshr(($222|0),($229|0),4)|0);
      $231 = tempRet0;
      $232 = ($230|0)==(0);
      $233 = ($231|0)==(0);
      $234 = $232 & $233;
      if ($234) {
       break;
      } else {
       $$012$i = $228;$222 = $230;$229 = $231;
      }
     }
     $235 = $arg;
     $236 = $235;
     $237 = HEAP32[$236>>2]|0;
     $238 = (($235) + 4)|0;
     $239 = $238;
     $240 = HEAP32[$239>>2]|0;
     $241 = ($237|0)==(0);
     $242 = ($240|0)==(0);
     $243 = $241 & $242;
     $244 = $fl$3 & 8;
     $245 = ($244|0)==(0);
     $or$cond17 = $245 | $243;
     if ($or$cond17) {
      $a$0 = $228;$fl$4 = $fl$3;$p$2 = $p$1;$pl$1 = 0;$prefix$1 = 15116;
      label = 79;
     } else {
      $246 = $t$1 >> 4;
      $247 = (15116 + ($246)|0);
      $a$0 = $228;$fl$4 = $fl$3;$p$2 = $p$1;$pl$1 = 2;$prefix$1 = $247;
      label = 79;
     }
    }
   }
   else if ((label|0) == 78) {
    label = 0;
    $293 = (_fmt_u($291,$292,$1)|0);
    $a$0 = $293;$fl$4 = $fl$1$;$p$2 = $p$0;$pl$1 = $pl$0;$prefix$1 = $prefix$0;
    label = 79;
   }
   else if ((label|0) == 92) {
    label = 0;
    $340 = (_memchr($a$1,0,$p$0)|0);
    $341 = ($340|0)==(0|0);
    $342 = $340;
    $343 = $a$1;
    $344 = (($342) - ($343))|0;
    $345 = (($a$1) + ($p$0)|0);
    $z$1 = $341 ? $345 : $340;
    $p$3 = $341 ? $p$0 : $344;
    $a$2 = $a$1;$fl$6 = $180;$p$5 = $p$3;$pl$2 = 0;$prefix$2 = 15116;$z$2 = $z$1;
   }
   else if ((label|0) == 96) {
    label = 0;
    $i$0105 = 0;$l$1104 = 0;$ws$0106 = $815;
    while(1) {
     $353 = HEAP32[$ws$0106>>2]|0;
     $354 = ($353|0)==(0);
     if ($354) {
      $i$0$lcssa = $i$0105;$l$2 = $l$1104;
      break;
     }
     $355 = (_wctomb($mb,$353)|0);
     $356 = ($355|0)<(0);
     $357 = (($p$4176) - ($i$0105))|0;
     $358 = ($355>>>0)>($357>>>0);
     $or$cond20 = $356 | $358;
     if ($or$cond20) {
      $i$0$lcssa = $i$0105;$l$2 = $355;
      break;
     }
     $359 = ((($ws$0106)) + 4|0);
     $360 = (($355) + ($i$0105))|0;
     $361 = ($p$4176>>>0)>($360>>>0);
     if ($361) {
      $i$0105 = $360;$l$1104 = $355;$ws$0106 = $359;
     } else {
      $i$0$lcssa = $360;$l$2 = $355;
      break;
     }
    }
    $362 = ($l$2|0)<(0);
    if ($362) {
     $$0 = -1;
     break L1;
    }
    _pad($f,32,$w$1,$i$0$lcssa,$fl$1$);
    $363 = ($i$0$lcssa|0)==(0);
    if ($363) {
     $i$0$lcssa178 = 0;
     label = 107;
    } else {
     $i$1116 = 0;$ws$1117 = $815;
     while(1) {
      $364 = HEAP32[$ws$1117>>2]|0;
      $365 = ($364|0)==(0);
      if ($365) {
       $i$0$lcssa178 = $i$0$lcssa;
       label = 107;
       break L327;
      }
      $366 = ((($ws$1117)) + 4|0);
      $367 = (_wctomb($mb,$364)|0);
      $368 = (($367) + ($i$1116))|0;
      $369 = ($368|0)>($i$0$lcssa|0);
      if ($369) {
       $i$0$lcssa178 = $i$0$lcssa;
       label = 107;
       break L327;
      }
      $370 = HEAP32[$f>>2]|0;
      $371 = $370 & 32;
      $372 = ($371|0)==(0);
      if ($372) {
       ___fwritex($mb,$367,$f);
      }
      $373 = ($368>>>0)<($i$0$lcssa>>>0);
      if ($373) {
       $i$1116 = $368;$ws$1117 = $366;
      } else {
       $i$0$lcssa178 = $i$0$lcssa;
       label = 107;
       break;
      }
     }
    }
   }
  } while(0);
  if ((label|0) == 107) {
   label = 0;
   $374 = $fl$1$ ^ 8192;
   _pad($f,32,$w$1,$i$0$lcssa178,$374);
   $375 = ($w$1|0)>($i$0$lcssa178|0);
   $376 = $375 ? $w$1 : $i$0$lcssa178;
   $cnt$0 = $cnt$1;$l$0 = $376;$l10n$0 = $l10n$3;$s$0 = $151;
   continue;
  }
  if ((label|0) == 79) {
   label = 0;
   $294 = ($p$2|0)>(-1);
   $295 = $fl$4 & -65537;
   $$fl$4 = $294 ? $295 : $fl$4;
   $296 = $arg;
   $297 = $296;
   $298 = HEAP32[$297>>2]|0;
   $299 = (($296) + 4)|0;
   $300 = $299;
   $301 = HEAP32[$300>>2]|0;
   $302 = ($298|0)!=(0);
   $303 = ($301|0)!=(0);
   $304 = $302 | $303;
   $305 = ($p$2|0)!=(0);
   $or$cond = $305 | $304;
   if ($or$cond) {
    $306 = $a$0;
    $307 = (($2) - ($306))|0;
    $308 = $304&1;
    $309 = $308 ^ 1;
    $310 = (($309) + ($307))|0;
    $311 = ($p$2|0)>($310|0);
    $p$2$ = $311 ? $p$2 : $310;
    $a$2 = $a$0;$fl$6 = $$fl$4;$p$5 = $p$2$;$pl$2 = $pl$1;$prefix$2 = $prefix$1;$z$2 = $1;
   } else {
    $a$2 = $1;$fl$6 = $$fl$4;$p$5 = 0;$pl$2 = $pl$1;$prefix$2 = $prefix$1;$z$2 = $1;
   }
  }
  $789 = $z$2;
  $790 = $a$2;
  $791 = (($789) - ($790))|0;
  $792 = ($p$5|0)<($791|0);
  $$p$5 = $792 ? $791 : $p$5;
  $793 = (($pl$2) + ($$p$5))|0;
  $794 = ($w$1|0)<($793|0);
  $w$2 = $794 ? $793 : $w$1;
  _pad($f,32,$w$2,$793,$fl$6);
  $795 = HEAP32[$f>>2]|0;
  $796 = $795 & 32;
  $797 = ($796|0)==(0);
  if ($797) {
   ___fwritex($prefix$2,$pl$2,$f);
  }
  $798 = $fl$6 ^ 65536;
  _pad($f,48,$w$2,$793,$798);
  _pad($f,48,$$p$5,$791,0);
  $799 = HEAP32[$f>>2]|0;
  $800 = $799 & 32;
  $801 = ($800|0)==(0);
  if ($801) {
   ___fwritex($a$2,$791,$f);
  }
  $802 = $fl$6 ^ 8192;
  _pad($f,32,$w$2,$793,$802);
  $cnt$0 = $cnt$1;$l$0 = $w$2;$l10n$0 = $l10n$3;$s$0 = $151;
 }
 L361: do {
  if ((label|0) == 254) {
   $803 = ($f|0)==(0|0);
   if ($803) {
    $804 = ($l10n$0|0)==(0);
    if ($804) {
     $$0 = 0;
    } else {
     $i$291 = 1;
     while(1) {
      $805 = (($nl_type) + ($i$291<<2)|0);
      $806 = HEAP32[$805>>2]|0;
      $807 = ($806|0)==(0);
      if ($807) {
       $814 = 0;$i$389 = $i$291;
       break;
      }
      $808 = (($nl_arg) + ($i$291<<3)|0);
      _pop_arg($808,$806,$ap);
      $809 = (($i$291) + 1)|0;
      $810 = ($809|0)<(10);
      if ($810) {
       $i$291 = $809;
      } else {
       $$0 = 1;
       break L361;
      }
     }
     while(1) {
      $813 = ($814|0)==(0);
      $812 = (($i$389) + 1)|0;
      if (!($813)) {
       $$0 = -1;
       break L361;
      }
      $811 = ($812|0)<(10);
      if (!($811)) {
       $$0 = 1;
       break L361;
      }
      $$phi$trans$insert = (($nl_type) + ($812<<2)|0);
      $$pre47 = HEAP32[$$phi$trans$insert>>2]|0;
      $814 = $$pre47;$i$389 = $812;
     }
    }
   } else {
    $$0 = $cnt$1;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___fwritex($s,$l,$f) {
 $s = $s|0;
 $l = $l|0;
 $f = $f|0;
 var $$01 = 0, $$02 = 0, $$pre = 0, $$pre6 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i$0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($f)) + 16|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  $4 = (___towrite($f)|0);
  $5 = ($4|0)==(0);
  if ($5) {
   $$pre = HEAP32[$0>>2]|0;
   $9 = $$pre;
   label = 5;
  }
 } else {
  $3 = $1;
  $9 = $3;
  label = 5;
 }
 L5: do {
  if ((label|0) == 5) {
   $6 = ((($f)) + 20|0);
   $7 = HEAP32[$6>>2]|0;
   $8 = (($9) - ($7))|0;
   $10 = ($8>>>0)<($l>>>0);
   $11 = $7;
   if ($10) {
    $12 = ((($f)) + 36|0);
    $13 = HEAP32[$12>>2]|0;
    (FUNCTION_TABLE_iiii[$13 & 31]($f,$s,$l)|0);
    break;
   }
   $14 = ((($f)) + 75|0);
   $15 = HEAP8[$14>>0]|0;
   $16 = ($15<<24>>24)>(-1);
   L10: do {
    if ($16) {
     $i$0 = $l;
     while(1) {
      $17 = ($i$0|0)==(0);
      if ($17) {
       $$01 = $l;$$02 = $s;$28 = $11;
       break L10;
      }
      $18 = (($i$0) + -1)|0;
      $19 = (($s) + ($18)|0);
      $20 = HEAP8[$19>>0]|0;
      $21 = ($20<<24>>24)==(10);
      if ($21) {
       break;
      } else {
       $i$0 = $18;
      }
     }
     $22 = ((($f)) + 36|0);
     $23 = HEAP32[$22>>2]|0;
     $24 = (FUNCTION_TABLE_iiii[$23 & 31]($f,$s,$i$0)|0);
     $25 = ($24>>>0)<($i$0>>>0);
     if ($25) {
      break L5;
     }
     $26 = (($s) + ($i$0)|0);
     $27 = (($l) - ($i$0))|0;
     $$pre6 = HEAP32[$6>>2]|0;
     $$01 = $27;$$02 = $26;$28 = $$pre6;
    } else {
     $$01 = $l;$$02 = $s;$28 = $11;
    }
   } while(0);
   _memcpy(($28|0),($$02|0),($$01|0))|0;
   $29 = HEAP32[$6>>2]|0;
   $30 = (($29) + ($$01)|0);
   HEAP32[$6>>2] = $30;
  }
 } while(0);
 return;
}
function ___towrite($f) {
 $f = $f|0;
 var $$0 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($f)) + 74|0);
 $1 = HEAP8[$0>>0]|0;
 $2 = $1 << 24 >> 24;
 $3 = (($2) + 255)|0;
 $4 = $3 | $2;
 $5 = $4&255;
 HEAP8[$0>>0] = $5;
 $6 = HEAP32[$f>>2]|0;
 $7 = $6 & 8;
 $8 = ($7|0)==(0);
 if ($8) {
  $10 = ((($f)) + 8|0);
  HEAP32[$10>>2] = 0;
  $11 = ((($f)) + 4|0);
  HEAP32[$11>>2] = 0;
  $12 = ((($f)) + 44|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ((($f)) + 28|0);
  HEAP32[$14>>2] = $13;
  $15 = ((($f)) + 20|0);
  HEAP32[$15>>2] = $13;
  $16 = $13;
  $17 = ((($f)) + 48|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = (($16) + ($18)|0);
  $20 = ((($f)) + 16|0);
  HEAP32[$20>>2] = $19;
  $$0 = 0;
 } else {
  $9 = $6 | 32;
  HEAP32[$f>>2] = $9;
  $$0 = -1;
 }
 return ($$0|0);
}
function _pop_arg($arg,$type,$ap) {
 $arg = $arg|0;
 $type = $type|0;
 $ap = $ap|0;
 var $$mask = 0, $$mask1 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0.0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0.0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current11 = 0, $arglist_current14 = 0, $arglist_current17 = 0;
 var $arglist_current2 = 0, $arglist_current20 = 0, $arglist_current23 = 0, $arglist_current26 = 0, $arglist_current5 = 0, $arglist_current8 = 0, $arglist_next = 0, $arglist_next12 = 0, $arglist_next15 = 0, $arglist_next18 = 0, $arglist_next21 = 0, $arglist_next24 = 0, $arglist_next27 = 0, $arglist_next3 = 0, $arglist_next6 = 0, $arglist_next9 = 0, $expanded = 0, $expanded28 = 0, $expanded30 = 0, $expanded31 = 0;
 var $expanded32 = 0, $expanded34 = 0, $expanded35 = 0, $expanded37 = 0, $expanded38 = 0, $expanded39 = 0, $expanded41 = 0, $expanded42 = 0, $expanded44 = 0, $expanded45 = 0, $expanded46 = 0, $expanded48 = 0, $expanded49 = 0, $expanded51 = 0, $expanded52 = 0, $expanded53 = 0, $expanded55 = 0, $expanded56 = 0, $expanded58 = 0, $expanded59 = 0;
 var $expanded60 = 0, $expanded62 = 0, $expanded63 = 0, $expanded65 = 0, $expanded66 = 0, $expanded67 = 0, $expanded69 = 0, $expanded70 = 0, $expanded72 = 0, $expanded73 = 0, $expanded74 = 0, $expanded76 = 0, $expanded77 = 0, $expanded79 = 0, $expanded80 = 0, $expanded81 = 0, $expanded83 = 0, $expanded84 = 0, $expanded86 = 0, $expanded87 = 0;
 var $expanded88 = 0, $expanded90 = 0, $expanded91 = 0, $expanded93 = 0, $expanded94 = 0, $expanded95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($type>>>0)>(20);
 L1: do {
  if (!($0)) {
   do {
    switch ($type|0) {
    case 9:  {
     $arglist_current = HEAP32[$ap>>2]|0;
     $1 = $arglist_current;
     $2 = ((0) + 4|0);
     $expanded28 = $2;
     $expanded = (($expanded28) - 1)|0;
     $3 = (($1) + ($expanded))|0;
     $4 = ((0) + 4|0);
     $expanded32 = $4;
     $expanded31 = (($expanded32) - 1)|0;
     $expanded30 = $expanded31 ^ -1;
     $5 = $3 & $expanded30;
     $6 = $5;
     $7 = HEAP32[$6>>2]|0;
     $arglist_next = ((($6)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next;
     HEAP32[$arg>>2] = $7;
     break L1;
     break;
    }
    case 10:  {
     $arglist_current2 = HEAP32[$ap>>2]|0;
     $8 = $arglist_current2;
     $9 = ((0) + 4|0);
     $expanded35 = $9;
     $expanded34 = (($expanded35) - 1)|0;
     $10 = (($8) + ($expanded34))|0;
     $11 = ((0) + 4|0);
     $expanded39 = $11;
     $expanded38 = (($expanded39) - 1)|0;
     $expanded37 = $expanded38 ^ -1;
     $12 = $10 & $expanded37;
     $13 = $12;
     $14 = HEAP32[$13>>2]|0;
     $arglist_next3 = ((($13)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next3;
     $15 = ($14|0)<(0);
     $16 = $15 << 31 >> 31;
     $17 = $arg;
     $18 = $17;
     HEAP32[$18>>2] = $14;
     $19 = (($17) + 4)|0;
     $20 = $19;
     HEAP32[$20>>2] = $16;
     break L1;
     break;
    }
    case 11:  {
     $arglist_current5 = HEAP32[$ap>>2]|0;
     $21 = $arglist_current5;
     $22 = ((0) + 4|0);
     $expanded42 = $22;
     $expanded41 = (($expanded42) - 1)|0;
     $23 = (($21) + ($expanded41))|0;
     $24 = ((0) + 4|0);
     $expanded46 = $24;
     $expanded45 = (($expanded46) - 1)|0;
     $expanded44 = $expanded45 ^ -1;
     $25 = $23 & $expanded44;
     $26 = $25;
     $27 = HEAP32[$26>>2]|0;
     $arglist_next6 = ((($26)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next6;
     $28 = $arg;
     $29 = $28;
     HEAP32[$29>>2] = $27;
     $30 = (($28) + 4)|0;
     $31 = $30;
     HEAP32[$31>>2] = 0;
     break L1;
     break;
    }
    case 12:  {
     $arglist_current8 = HEAP32[$ap>>2]|0;
     $32 = $arglist_current8;
     $33 = ((0) + 8|0);
     $expanded49 = $33;
     $expanded48 = (($expanded49) - 1)|0;
     $34 = (($32) + ($expanded48))|0;
     $35 = ((0) + 8|0);
     $expanded53 = $35;
     $expanded52 = (($expanded53) - 1)|0;
     $expanded51 = $expanded52 ^ -1;
     $36 = $34 & $expanded51;
     $37 = $36;
     $38 = $37;
     $39 = $38;
     $40 = HEAP32[$39>>2]|0;
     $41 = (($38) + 4)|0;
     $42 = $41;
     $43 = HEAP32[$42>>2]|0;
     $arglist_next9 = ((($37)) + 8|0);
     HEAP32[$ap>>2] = $arglist_next9;
     $44 = $arg;
     $45 = $44;
     HEAP32[$45>>2] = $40;
     $46 = (($44) + 4)|0;
     $47 = $46;
     HEAP32[$47>>2] = $43;
     break L1;
     break;
    }
    case 13:  {
     $arglist_current11 = HEAP32[$ap>>2]|0;
     $48 = $arglist_current11;
     $49 = ((0) + 4|0);
     $expanded56 = $49;
     $expanded55 = (($expanded56) - 1)|0;
     $50 = (($48) + ($expanded55))|0;
     $51 = ((0) + 4|0);
     $expanded60 = $51;
     $expanded59 = (($expanded60) - 1)|0;
     $expanded58 = $expanded59 ^ -1;
     $52 = $50 & $expanded58;
     $53 = $52;
     $54 = HEAP32[$53>>2]|0;
     $arglist_next12 = ((($53)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next12;
     $55 = $54&65535;
     $56 = $55 << 16 >> 16;
     $57 = ($56|0)<(0);
     $58 = $57 << 31 >> 31;
     $59 = $arg;
     $60 = $59;
     HEAP32[$60>>2] = $56;
     $61 = (($59) + 4)|0;
     $62 = $61;
     HEAP32[$62>>2] = $58;
     break L1;
     break;
    }
    case 14:  {
     $arglist_current14 = HEAP32[$ap>>2]|0;
     $63 = $arglist_current14;
     $64 = ((0) + 4|0);
     $expanded63 = $64;
     $expanded62 = (($expanded63) - 1)|0;
     $65 = (($63) + ($expanded62))|0;
     $66 = ((0) + 4|0);
     $expanded67 = $66;
     $expanded66 = (($expanded67) - 1)|0;
     $expanded65 = $expanded66 ^ -1;
     $67 = $65 & $expanded65;
     $68 = $67;
     $69 = HEAP32[$68>>2]|0;
     $arglist_next15 = ((($68)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next15;
     $$mask1 = $69 & 65535;
     $70 = $arg;
     $71 = $70;
     HEAP32[$71>>2] = $$mask1;
     $72 = (($70) + 4)|0;
     $73 = $72;
     HEAP32[$73>>2] = 0;
     break L1;
     break;
    }
    case 15:  {
     $arglist_current17 = HEAP32[$ap>>2]|0;
     $74 = $arglist_current17;
     $75 = ((0) + 4|0);
     $expanded70 = $75;
     $expanded69 = (($expanded70) - 1)|0;
     $76 = (($74) + ($expanded69))|0;
     $77 = ((0) + 4|0);
     $expanded74 = $77;
     $expanded73 = (($expanded74) - 1)|0;
     $expanded72 = $expanded73 ^ -1;
     $78 = $76 & $expanded72;
     $79 = $78;
     $80 = HEAP32[$79>>2]|0;
     $arglist_next18 = ((($79)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next18;
     $81 = $80&255;
     $82 = $81 << 24 >> 24;
     $83 = ($82|0)<(0);
     $84 = $83 << 31 >> 31;
     $85 = $arg;
     $86 = $85;
     HEAP32[$86>>2] = $82;
     $87 = (($85) + 4)|0;
     $88 = $87;
     HEAP32[$88>>2] = $84;
     break L1;
     break;
    }
    case 16:  {
     $arglist_current20 = HEAP32[$ap>>2]|0;
     $89 = $arglist_current20;
     $90 = ((0) + 4|0);
     $expanded77 = $90;
     $expanded76 = (($expanded77) - 1)|0;
     $91 = (($89) + ($expanded76))|0;
     $92 = ((0) + 4|0);
     $expanded81 = $92;
     $expanded80 = (($expanded81) - 1)|0;
     $expanded79 = $expanded80 ^ -1;
     $93 = $91 & $expanded79;
     $94 = $93;
     $95 = HEAP32[$94>>2]|0;
     $arglist_next21 = ((($94)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next21;
     $$mask = $95 & 255;
     $96 = $arg;
     $97 = $96;
     HEAP32[$97>>2] = $$mask;
     $98 = (($96) + 4)|0;
     $99 = $98;
     HEAP32[$99>>2] = 0;
     break L1;
     break;
    }
    case 17:  {
     $arglist_current23 = HEAP32[$ap>>2]|0;
     $100 = $arglist_current23;
     $101 = ((0) + 8|0);
     $expanded84 = $101;
     $expanded83 = (($expanded84) - 1)|0;
     $102 = (($100) + ($expanded83))|0;
     $103 = ((0) + 8|0);
     $expanded88 = $103;
     $expanded87 = (($expanded88) - 1)|0;
     $expanded86 = $expanded87 ^ -1;
     $104 = $102 & $expanded86;
     $105 = $104;
     $106 = +HEAPF64[$105>>3];
     $arglist_next24 = ((($105)) + 8|0);
     HEAP32[$ap>>2] = $arglist_next24;
     HEAPF64[$arg>>3] = $106;
     break L1;
     break;
    }
    case 18:  {
     $arglist_current26 = HEAP32[$ap>>2]|0;
     $107 = $arglist_current26;
     $108 = ((0) + 8|0);
     $expanded91 = $108;
     $expanded90 = (($expanded91) - 1)|0;
     $109 = (($107) + ($expanded90))|0;
     $110 = ((0) + 8|0);
     $expanded95 = $110;
     $expanded94 = (($expanded95) - 1)|0;
     $expanded93 = $expanded94 ^ -1;
     $111 = $109 & $expanded93;
     $112 = $111;
     $113 = +HEAPF64[$112>>3];
     $arglist_next27 = ((($112)) + 8|0);
     HEAP32[$ap>>2] = $arglist_next27;
     HEAPF64[$arg>>3] = $113;
     break L1;
     break;
    }
    default: {
     break L1;
    }
    }
   } while(0);
  }
 } while(0);
 return;
}
function _fmt_u($0,$1,$s) {
 $0 = $0|0;
 $1 = $1|0;
 $s = $s|0;
 var $$0$lcssa = 0, $$01$lcssa$off0 = 0, $$05 = 0, $$1$lcssa = 0, $$12 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $y$03 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1>>>0)>(0);
 $3 = ($0>>>0)>(4294967295);
 $4 = ($1|0)==(0);
 $5 = $4 & $3;
 $6 = $2 | $5;
 if ($6) {
  $$05 = $s;$7 = $0;$8 = $1;
  while(1) {
   $9 = (___uremdi3(($7|0),($8|0),10,0)|0);
   $10 = tempRet0;
   $11 = $9 | 48;
   $12 = $11&255;
   $13 = ((($$05)) + -1|0);
   HEAP8[$13>>0] = $12;
   $14 = (___udivdi3(($7|0),($8|0),10,0)|0);
   $15 = tempRet0;
   $16 = ($8>>>0)>(9);
   $17 = ($7>>>0)>(4294967295);
   $18 = ($8|0)==(9);
   $19 = $18 & $17;
   $20 = $16 | $19;
   if ($20) {
    $$05 = $13;$7 = $14;$8 = $15;
   } else {
    break;
   }
  }
  $$0$lcssa = $13;$$01$lcssa$off0 = $14;
 } else {
  $$0$lcssa = $s;$$01$lcssa$off0 = $0;
 }
 $21 = ($$01$lcssa$off0|0)==(0);
 if ($21) {
  $$1$lcssa = $$0$lcssa;
 } else {
  $$12 = $$0$lcssa;$y$03 = $$01$lcssa$off0;
  while(1) {
   $22 = (($y$03>>>0) % 10)&-1;
   $23 = $22 | 48;
   $24 = $23&255;
   $25 = ((($$12)) + -1|0);
   HEAP8[$25>>0] = $24;
   $26 = (($y$03>>>0) / 10)&-1;
   $27 = ($y$03>>>0)<(10);
   if ($27) {
    $$1$lcssa = $25;
    break;
   } else {
    $$12 = $25;$y$03 = $26;
   }
  }
 }
 return ($$1$lcssa|0);
}
function _memchr($src,$c,$n) {
 $src = $src|0;
 $c = $c|0;
 $n = $n|0;
 var $$0$lcssa = 0, $$019 = 0, $$1$lcssa = 0, $$110 = 0, $$24 = 0, $$3 = 0, $$lcssa = 0, $$pre = 0, $$pre10 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0;
 var $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond18 = 0, $s$0$lcssa = 0, $s$020 = 0, $s$15 = 0, $s$2 = 0, $w$0$lcssa = 0, $w$011 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = $c & 255;
 $1 = $src;
 $2 = $1 & 3;
 $3 = ($2|0)!=(0);
 $4 = ($n|0)!=(0);
 $or$cond18 = $4 & $3;
 L1: do {
  if ($or$cond18) {
   $5 = $c&255;
   $$019 = $n;$s$020 = $src;
   while(1) {
    $6 = HEAP8[$s$020>>0]|0;
    $7 = ($6<<24>>24)==($5<<24>>24);
    if ($7) {
     $$3 = $$019;$s$2 = $s$020;
     break L1;
    }
    $8 = ((($s$020)) + 1|0);
    $9 = (($$019) + -1)|0;
    $10 = $8;
    $11 = $10 & 3;
    $12 = ($11|0)!=(0);
    $13 = ($9|0)!=(0);
    $or$cond = $13 & $12;
    if ($or$cond) {
     $$019 = $9;$s$020 = $8;
    } else {
     $$0$lcssa = $9;$$lcssa = $13;$s$0$lcssa = $8;
     label = 5;
     break;
    }
   }
  } else {
   $$0$lcssa = $n;$$lcssa = $4;$s$0$lcssa = $src;
   label = 5;
  }
 } while(0);
 L6: do {
  if ((label|0) == 5) {
   if ($$lcssa) {
    $$pre = HEAP8[$s$0$lcssa>>0]|0;
    $$pre10 = $c&255;
    $14 = ($$pre<<24>>24)==($$pre10<<24>>24);
    if ($14) {
     $$3 = $$0$lcssa;$s$2 = $s$0$lcssa;
    } else {
     $15 = Math_imul($0, 16843009)|0;
     $16 = ($$0$lcssa>>>0)>(3);
     L10: do {
      if ($16) {
       $$110 = $$0$lcssa;$w$011 = $s$0$lcssa;
       while(1) {
        $17 = HEAP32[$w$011>>2]|0;
        $18 = $17 ^ $15;
        $19 = (($18) + -16843009)|0;
        $20 = $18 & -2139062144;
        $21 = $20 ^ -2139062144;
        $22 = $21 & $19;
        $23 = ($22|0)==(0);
        if (!($23)) {
         break;
        }
        $24 = ((($w$011)) + 4|0);
        $25 = (($$110) + -4)|0;
        $26 = ($25>>>0)>(3);
        if ($26) {
         $$110 = $25;$w$011 = $24;
        } else {
         $$1$lcssa = $25;$w$0$lcssa = $24;
         label = 11;
         break L10;
        }
       }
       $$24 = $$110;$s$15 = $w$011;
      } else {
       $$1$lcssa = $$0$lcssa;$w$0$lcssa = $s$0$lcssa;
       label = 11;
      }
     } while(0);
     if ((label|0) == 11) {
      $27 = ($$1$lcssa|0)==(0);
      if ($27) {
       $$3 = 0;$s$2 = $w$0$lcssa;
       break;
      } else {
       $$24 = $$1$lcssa;$s$15 = $w$0$lcssa;
      }
     }
     while(1) {
      $28 = HEAP8[$s$15>>0]|0;
      $29 = ($28<<24>>24)==($$pre10<<24>>24);
      if ($29) {
       $$3 = $$24;$s$2 = $s$15;
       break L6;
      }
      $30 = ((($s$15)) + 1|0);
      $31 = (($$24) + -1)|0;
      $32 = ($31|0)==(0);
      if ($32) {
       $$3 = 0;$s$2 = $30;
       break;
      } else {
       $$24 = $31;$s$15 = $30;
      }
     }
    }
   } else {
    $$3 = 0;$s$2 = $s$0$lcssa;
   }
  }
 } while(0);
 $33 = ($$3|0)!=(0);
 $34 = $33 ? $s$2 : 0;
 return ($34|0);
}
function _pad($f,$c,$w,$l,$fl) {
 $f = $f|0;
 $c = $c|0;
 $w = $w|0;
 $l = $l|0;
 $fl = $fl|0;
 var $$0$lcssa6 = 0, $$02 = 0, $$pre = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $or$cond = 0, $pad = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $pad = sp;
 $0 = $fl & 73728;
 $1 = ($0|0)==(0);
 $2 = ($w|0)>($l|0);
 $or$cond = $2 & $1;
 do {
  if ($or$cond) {
   $3 = (($w) - ($l))|0;
   $4 = ($3>>>0)>(256);
   $5 = $4 ? 256 : $3;
   _memset(($pad|0),($c|0),($5|0))|0;
   $6 = ($3>>>0)>(255);
   $7 = HEAP32[$f>>2]|0;
   $8 = $7 & 32;
   $9 = ($8|0)==(0);
   if ($6) {
    $$02 = $3;$16 = $7;$17 = $9;
    while(1) {
     if ($17) {
      ___fwritex($pad,256,$f);
      $$pre = HEAP32[$f>>2]|0;
      $13 = $$pre;
     } else {
      $13 = $16;
     }
     $10 = (($$02) + -256)|0;
     $11 = ($10>>>0)>(255);
     $12 = $13 & 32;
     $14 = ($12|0)==(0);
     if ($11) {
      $$02 = $10;$16 = $13;$17 = $14;
     } else {
      break;
     }
    }
    $15 = $3 & 255;
    if ($14) {
     $$0$lcssa6 = $15;
    } else {
     break;
    }
   } else {
    if ($9) {
     $$0$lcssa6 = $3;
    } else {
     break;
    }
   }
   ___fwritex($pad,$$0$lcssa6,$f);
  }
 } while(0);
 STACKTOP = sp;return;
}
function _wctomb($s,$wc) {
 $s = $s|0;
 $wc = $wc|0;
 var $$0 = 0, $$0$i$i = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($s|0)==(0|0);
 do {
  if ($0) {
   $$0 = 0;
  } else {
   $1 = ($wc>>>0)<(128);
   if ($1) {
    $2 = $wc&255;
    HEAP8[$s>>0] = $2;
    $$0 = 1;
    break;
   }
   $3 = ($wc>>>0)<(2048);
   if ($3) {
    $4 = $wc >>> 6;
    $5 = $4 | 192;
    $6 = $5&255;
    $7 = ((($s)) + 1|0);
    HEAP8[$s>>0] = $6;
    $8 = $wc & 63;
    $9 = $8 | 128;
    $10 = $9&255;
    HEAP8[$7>>0] = $10;
    $$0 = 2;
    break;
   }
   $11 = ($wc>>>0)<(55296);
   $12 = $wc & -8192;
   $13 = ($12|0)==(57344);
   $or$cond$i = $11 | $13;
   if ($or$cond$i) {
    $14 = $wc >>> 12;
    $15 = $14 | 224;
    $16 = $15&255;
    $17 = ((($s)) + 1|0);
    HEAP8[$s>>0] = $16;
    $18 = $wc >>> 6;
    $19 = $18 & 63;
    $20 = $19 | 128;
    $21 = $20&255;
    $22 = ((($s)) + 2|0);
    HEAP8[$17>>0] = $21;
    $23 = $wc & 63;
    $24 = $23 | 128;
    $25 = $24&255;
    HEAP8[$22>>0] = $25;
    $$0 = 3;
    break;
   }
   $26 = (($wc) + -65536)|0;
   $27 = ($26>>>0)<(1048576);
   if ($27) {
    $28 = $wc >>> 18;
    $29 = $28 | 240;
    $30 = $29&255;
    $31 = ((($s)) + 1|0);
    HEAP8[$s>>0] = $30;
    $32 = $wc >>> 12;
    $33 = $32 & 63;
    $34 = $33 | 128;
    $35 = $34&255;
    $36 = ((($s)) + 2|0);
    HEAP8[$31>>0] = $35;
    $37 = $wc >>> 6;
    $38 = $37 & 63;
    $39 = $38 | 128;
    $40 = $39&255;
    $41 = ((($s)) + 3|0);
    HEAP8[$36>>0] = $40;
    $42 = $wc & 63;
    $43 = $42 | 128;
    $44 = $43&255;
    HEAP8[$41>>0] = $44;
    $$0 = 4;
    break;
   }
   $45 = HEAP32[4331]|0;
   $46 = ($45|0)==(0|0);
   if ($46) {
    $$0$i$i = 17368;
   } else {
    $47 = (_pthread_self()|0);
    $48 = ((($47)) + 64|0);
    $49 = HEAP32[$48>>2]|0;
    $$0$i$i = $49;
   }
   HEAP32[$$0$i$i>>2] = 84;
   $$0 = -1;
  }
 } while(0);
 return ($$0|0);
}
function _frexp($x,$e) {
 $x = +$x;
 $e = $e|0;
 var $$0 = 0.0, $$01 = 0.0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0.0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0.0, $7 = 0.0, $8 = 0, $9 = 0, $storemerge = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $x;$0 = HEAP32[tempDoublePtr>>2]|0;
 $1 = HEAP32[tempDoublePtr+4>>2]|0;
 $2 = (_bitshift64Lshr(($0|0),($1|0),52)|0);
 $3 = tempRet0;
 $4 = $2 & 2047;
 switch ($4|0) {
 case 0:  {
  $5 = $x != 0.0;
  if ($5) {
   $6 = $x * 1.8446744073709552E+19;
   $7 = (+_frexp($6,$e));
   $8 = HEAP32[$e>>2]|0;
   $9 = (($8) + -64)|0;
   $$01 = $7;$storemerge = $9;
  } else {
   $$01 = $x;$storemerge = 0;
  }
  HEAP32[$e>>2] = $storemerge;
  $$0 = $$01;
  break;
 }
 case 2047:  {
  $$0 = $x;
  break;
 }
 default: {
  $10 = (($4) + -1022)|0;
  HEAP32[$e>>2] = $10;
  $11 = $1 & -2146435073;
  $12 = $11 | 1071644672;
  HEAP32[tempDoublePtr>>2] = $0;HEAP32[tempDoublePtr+4>>2] = $12;$13 = +HEAPF64[tempDoublePtr>>3];
  $$0 = $13;
 }
 }
 return (+$$0);
}
function _ntohs($n) {
 $n = $n|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = $n&65535;
 $1 = $0 << 8;
 $2 = $0 >>> 8;
 $3 = $1 | $2;
 $4 = $3&65535;
 return ($4|0);
}
function _fprintf($f,$fmt,$varargs) {
 $f = $f|0;
 $fmt = $fmt|0;
 $varargs = $varargs|0;
 var $ap = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $ap = sp;
 HEAP32[$ap>>2] = $varargs;
 (_vfprintf($f,$fmt,$ap)|0);
 STACKTOP = sp;return;
}
function _htonl($n) {
 $n = $n|0;
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_llvm_bswap_i32(($n|0))|0);
 return ($0|0);
}
function _printf($fmt,$varargs) {
 $fmt = $fmt|0;
 $varargs = $varargs|0;
 var $ap = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $ap = sp;
 HEAP32[$ap>>2] = $varargs;
 (_vfprintf(9172,$fmt,$ap)|0);
 STACKTOP = sp;return;
}
function _malloc($bytes) {
 $bytes = $bytes|0;
 var $$0 = 0, $$0$i = 0, $$not$i = 0, $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i13 = 0, $$pre$i16$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i14Z2D = 0, $$pre$phi$i17$iZ2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi10$i$iZ2D = 0, $$pre$phiZ2D = 0, $$pre71 = 0, $$pre9$i$i = 0, $$rsize$0$i = 0, $$rsize$4$i = 0, $$v$0$i = 0, $0 = 0;
 var $1 = 0, $10 = 0, $100 = 0, $1000 = 0, $1001 = 0, $1002 = 0, $1003 = 0, $1004 = 0, $1005 = 0, $1006 = 0, $1007 = 0, $1008 = 0, $1009 = 0, $101 = 0, $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0;
 var $1016 = 0, $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0, $1020 = 0, $1021 = 0, $1022 = 0, $1023 = 0, $1024 = 0, $1025 = 0, $1026 = 0, $1027 = 0, $1028 = 0, $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0;
 var $1034 = 0, $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0, $1039 = 0, $104 = 0, $1040 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1044 = 0, $1045 = 0, $1046 = 0, $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0;
 var $1052 = 0, $1053 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $1057 = 0, $1058 = 0, $1059 = 0, $106 = 0, $1060 = 0, $1061 = 0, $1062 = 0, $1063 = 0, $1064 = 0, $1065 = 0, $1066 = 0, $1067 = 0, $107 = 0, $108 = 0, $109 = 0;
 var $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0;
 var $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0;
 var $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0;
 var $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0;
 var $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0;
 var $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0;
 var $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0;
 var $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0;
 var $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0;
 var $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0;
 var $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0;
 var $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0;
 var $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0;
 var $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0;
 var $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0;
 var $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0;
 var $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0;
 var $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0;
 var $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0;
 var $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0;
 var $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0;
 var $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0;
 var $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0;
 var $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0;
 var $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0;
 var $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0;
 var $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0;
 var $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0;
 var $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0;
 var $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0;
 var $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0;
 var $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0;
 var $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0;
 var $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0;
 var $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0;
 var $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0;
 var $759 = 0, $76 = 0, $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0;
 var $777 = 0, $778 = 0, $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0;
 var $795 = 0, $796 = 0, $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0;
 var $812 = 0, $813 = 0, $814 = 0, $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0, $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0;
 var $830 = 0, $831 = 0, $832 = 0, $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0, $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0;
 var $849 = 0, $85 = 0, $850 = 0, $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0, $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0;
 var $867 = 0, $868 = 0, $869 = 0, $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0, $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0;
 var $885 = 0, $886 = 0, $887 = 0, $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0, $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0;
 var $902 = 0, $903 = 0, $904 = 0, $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0, $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0;
 var $920 = 0, $921 = 0, $922 = 0, $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0, $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0;
 var $939 = 0, $94 = 0, $940 = 0, $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0, $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0;
 var $957 = 0, $958 = 0, $959 = 0, $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0, $970 = 0, $971 = 0, $972 = 0, $973 = 0, $974 = 0;
 var $975 = 0, $976 = 0, $977 = 0, $978 = 0, $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0, $983 = 0, $984 = 0, $985 = 0, $986 = 0, $987 = 0, $988 = 0, $989 = 0, $99 = 0, $990 = 0, $991 = 0, $992 = 0;
 var $993 = 0, $994 = 0, $995 = 0, $996 = 0, $997 = 0, $998 = 0, $999 = 0, $F$0$i$i = 0, $F1$0$i = 0, $F4$0 = 0, $F4$0$i$i = 0, $F5$0$i = 0, $I1$0$i$i = 0, $I7$0$i = 0, $I7$0$i$i = 0, $K12$0$i = 0, $K2$0$i$i = 0, $K8$0$i$i = 0, $R$1$i = 0, $R$1$i$i = 0;
 var $R$1$i9 = 0, $R$3$i = 0, $R$3$i$i = 0, $R$3$i11 = 0, $RP$1$i = 0, $RP$1$i$i = 0, $RP$1$i8 = 0, $T$0$i = 0, $T$0$i$i = 0, $T$0$i18$i = 0, $br$2$ph$i = 0, $cond$i = 0, $cond$i$i = 0, $cond$i12 = 0, $exitcond$i$i = 0, $i$01$i$i = 0, $idx$0$i = 0, $nb$0 = 0, $not$$i$i = 0, $not$$i20$i = 0;
 var $not$7$i = 0, $oldfirst$0$i$i = 0, $or$cond$i = 0, $or$cond$i17 = 0, $or$cond1$i = 0, $or$cond1$i16 = 0, $or$cond10$i = 0, $or$cond11$i = 0, $or$cond2$i = 0, $or$cond48$i = 0, $or$cond5$i = 0, $or$cond7$i = 0, $or$cond8$i = 0, $p$0$i$i = 0, $qsize$0$i$i = 0, $rsize$0$i = 0, $rsize$0$i5 = 0, $rsize$1$i = 0, $rsize$3$i = 0, $rsize$4$lcssa$i = 0;
 var $rsize$412$i = 0, $rst$0$i = 0, $rst$1$i = 0, $sizebits$0$$i = 0, $sizebits$0$i = 0, $sp$0$i$i = 0, $sp$0$i$i$i = 0, $sp$068$i = 0, $sp$167$i = 0, $ssize$0$i = 0, $ssize$2$ph$i = 0, $ssize$5$i = 0, $t$0$i = 0, $t$0$i4 = 0, $t$2$i = 0, $t$4$ph$i = 0, $t$4$v$4$i = 0, $t$411$i = 0, $tbase$746$i = 0, $tsize$745$i = 0;
 var $v$0$i = 0, $v$0$i6 = 0, $v$1$i = 0, $v$3$i = 0, $v$4$lcssa$i = 0, $v$413$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($bytes>>>0)<(245);
 do {
  if ($0) {
   $1 = ($bytes>>>0)<(11);
   $2 = (($bytes) + 11)|0;
   $3 = $2 & -8;
   $4 = $1 ? 16 : $3;
   $5 = $4 >>> 3;
   $6 = HEAP32[4343]|0;
   $7 = $6 >>> $5;
   $8 = $7 & 3;
   $9 = ($8|0)==(0);
   if (!($9)) {
    $10 = $7 & 1;
    $11 = $10 ^ 1;
    $12 = (($11) + ($5))|0;
    $13 = $12 << 1;
    $14 = (17412 + ($13<<2)|0);
    $15 = ((($14)) + 8|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ((($16)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ($14|0)==($18|0);
    do {
     if ($19) {
      $20 = 1 << $12;
      $21 = $20 ^ -1;
      $22 = $6 & $21;
      HEAP32[4343] = $22;
     } else {
      $23 = HEAP32[(17388)>>2]|0;
      $24 = ($18>>>0)<($23>>>0);
      if ($24) {
       _abort();
       // unreachable;
      }
      $25 = ((($18)) + 12|0);
      $26 = HEAP32[$25>>2]|0;
      $27 = ($26|0)==($16|0);
      if ($27) {
       HEAP32[$25>>2] = $14;
       HEAP32[$15>>2] = $18;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $28 = $12 << 3;
    $29 = $28 | 3;
    $30 = ((($16)) + 4|0);
    HEAP32[$30>>2] = $29;
    $31 = (($16) + ($28)|0);
    $32 = ((($31)) + 4|0);
    $33 = HEAP32[$32>>2]|0;
    $34 = $33 | 1;
    HEAP32[$32>>2] = $34;
    $$0 = $17;
    return ($$0|0);
   }
   $35 = HEAP32[(17380)>>2]|0;
   $36 = ($4>>>0)>($35>>>0);
   if ($36) {
    $37 = ($7|0)==(0);
    if (!($37)) {
     $38 = $7 << $5;
     $39 = 2 << $5;
     $40 = (0 - ($39))|0;
     $41 = $39 | $40;
     $42 = $38 & $41;
     $43 = (0 - ($42))|0;
     $44 = $42 & $43;
     $45 = (($44) + -1)|0;
     $46 = $45 >>> 12;
     $47 = $46 & 16;
     $48 = $45 >>> $47;
     $49 = $48 >>> 5;
     $50 = $49 & 8;
     $51 = $50 | $47;
     $52 = $48 >>> $50;
     $53 = $52 >>> 2;
     $54 = $53 & 4;
     $55 = $51 | $54;
     $56 = $52 >>> $54;
     $57 = $56 >>> 1;
     $58 = $57 & 2;
     $59 = $55 | $58;
     $60 = $56 >>> $58;
     $61 = $60 >>> 1;
     $62 = $61 & 1;
     $63 = $59 | $62;
     $64 = $60 >>> $62;
     $65 = (($63) + ($64))|0;
     $66 = $65 << 1;
     $67 = (17412 + ($66<<2)|0);
     $68 = ((($67)) + 8|0);
     $69 = HEAP32[$68>>2]|0;
     $70 = ((($69)) + 8|0);
     $71 = HEAP32[$70>>2]|0;
     $72 = ($67|0)==($71|0);
     do {
      if ($72) {
       $73 = 1 << $65;
       $74 = $73 ^ -1;
       $75 = $6 & $74;
       HEAP32[4343] = $75;
       $90 = $35;
      } else {
       $76 = HEAP32[(17388)>>2]|0;
       $77 = ($71>>>0)<($76>>>0);
       if ($77) {
        _abort();
        // unreachable;
       }
       $78 = ((($71)) + 12|0);
       $79 = HEAP32[$78>>2]|0;
       $80 = ($79|0)==($69|0);
       if ($80) {
        HEAP32[$78>>2] = $67;
        HEAP32[$68>>2] = $71;
        $$pre = HEAP32[(17380)>>2]|0;
        $90 = $$pre;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $81 = $65 << 3;
     $82 = (($81) - ($4))|0;
     $83 = $4 | 3;
     $84 = ((($69)) + 4|0);
     HEAP32[$84>>2] = $83;
     $85 = (($69) + ($4)|0);
     $86 = $82 | 1;
     $87 = ((($85)) + 4|0);
     HEAP32[$87>>2] = $86;
     $88 = (($85) + ($82)|0);
     HEAP32[$88>>2] = $82;
     $89 = ($90|0)==(0);
     if (!($89)) {
      $91 = HEAP32[(17392)>>2]|0;
      $92 = $90 >>> 3;
      $93 = $92 << 1;
      $94 = (17412 + ($93<<2)|0);
      $95 = HEAP32[4343]|0;
      $96 = 1 << $92;
      $97 = $95 & $96;
      $98 = ($97|0)==(0);
      if ($98) {
       $99 = $95 | $96;
       HEAP32[4343] = $99;
       $$pre71 = ((($94)) + 8|0);
       $$pre$phiZ2D = $$pre71;$F4$0 = $94;
      } else {
       $100 = ((($94)) + 8|0);
       $101 = HEAP32[$100>>2]|0;
       $102 = HEAP32[(17388)>>2]|0;
       $103 = ($101>>>0)<($102>>>0);
       if ($103) {
        _abort();
        // unreachable;
       } else {
        $$pre$phiZ2D = $100;$F4$0 = $101;
       }
      }
      HEAP32[$$pre$phiZ2D>>2] = $91;
      $104 = ((($F4$0)) + 12|0);
      HEAP32[$104>>2] = $91;
      $105 = ((($91)) + 8|0);
      HEAP32[$105>>2] = $F4$0;
      $106 = ((($91)) + 12|0);
      HEAP32[$106>>2] = $94;
     }
     HEAP32[(17380)>>2] = $82;
     HEAP32[(17392)>>2] = $85;
     $$0 = $70;
     return ($$0|0);
    }
    $107 = HEAP32[(17376)>>2]|0;
    $108 = ($107|0)==(0);
    if ($108) {
     $nb$0 = $4;
    } else {
     $109 = (0 - ($107))|0;
     $110 = $107 & $109;
     $111 = (($110) + -1)|0;
     $112 = $111 >>> 12;
     $113 = $112 & 16;
     $114 = $111 >>> $113;
     $115 = $114 >>> 5;
     $116 = $115 & 8;
     $117 = $116 | $113;
     $118 = $114 >>> $116;
     $119 = $118 >>> 2;
     $120 = $119 & 4;
     $121 = $117 | $120;
     $122 = $118 >>> $120;
     $123 = $122 >>> 1;
     $124 = $123 & 2;
     $125 = $121 | $124;
     $126 = $122 >>> $124;
     $127 = $126 >>> 1;
     $128 = $127 & 1;
     $129 = $125 | $128;
     $130 = $126 >>> $128;
     $131 = (($129) + ($130))|0;
     $132 = (17676 + ($131<<2)|0);
     $133 = HEAP32[$132>>2]|0;
     $134 = ((($133)) + 4|0);
     $135 = HEAP32[$134>>2]|0;
     $136 = $135 & -8;
     $137 = (($136) - ($4))|0;
     $rsize$0$i = $137;$t$0$i = $133;$v$0$i = $133;
     while(1) {
      $138 = ((($t$0$i)) + 16|0);
      $139 = HEAP32[$138>>2]|0;
      $140 = ($139|0)==(0|0);
      if ($140) {
       $141 = ((($t$0$i)) + 20|0);
       $142 = HEAP32[$141>>2]|0;
       $143 = ($142|0)==(0|0);
       if ($143) {
        break;
       } else {
        $145 = $142;
       }
      } else {
       $145 = $139;
      }
      $144 = ((($145)) + 4|0);
      $146 = HEAP32[$144>>2]|0;
      $147 = $146 & -8;
      $148 = (($147) - ($4))|0;
      $149 = ($148>>>0)<($rsize$0$i>>>0);
      $$rsize$0$i = $149 ? $148 : $rsize$0$i;
      $$v$0$i = $149 ? $145 : $v$0$i;
      $rsize$0$i = $$rsize$0$i;$t$0$i = $145;$v$0$i = $$v$0$i;
     }
     $150 = HEAP32[(17388)>>2]|0;
     $151 = ($v$0$i>>>0)<($150>>>0);
     if ($151) {
      _abort();
      // unreachable;
     }
     $152 = (($v$0$i) + ($4)|0);
     $153 = ($v$0$i>>>0)<($152>>>0);
     if (!($153)) {
      _abort();
      // unreachable;
     }
     $154 = ((($v$0$i)) + 24|0);
     $155 = HEAP32[$154>>2]|0;
     $156 = ((($v$0$i)) + 12|0);
     $157 = HEAP32[$156>>2]|0;
     $158 = ($157|0)==($v$0$i|0);
     do {
      if ($158) {
       $168 = ((($v$0$i)) + 20|0);
       $169 = HEAP32[$168>>2]|0;
       $170 = ($169|0)==(0|0);
       if ($170) {
        $171 = ((($v$0$i)) + 16|0);
        $172 = HEAP32[$171>>2]|0;
        $173 = ($172|0)==(0|0);
        if ($173) {
         $R$3$i = 0;
         break;
        } else {
         $R$1$i = $172;$RP$1$i = $171;
        }
       } else {
        $R$1$i = $169;$RP$1$i = $168;
       }
       while(1) {
        $174 = ((($R$1$i)) + 20|0);
        $175 = HEAP32[$174>>2]|0;
        $176 = ($175|0)==(0|0);
        if (!($176)) {
         $R$1$i = $175;$RP$1$i = $174;
         continue;
        }
        $177 = ((($R$1$i)) + 16|0);
        $178 = HEAP32[$177>>2]|0;
        $179 = ($178|0)==(0|0);
        if ($179) {
         break;
        } else {
         $R$1$i = $178;$RP$1$i = $177;
        }
       }
       $180 = ($RP$1$i>>>0)<($150>>>0);
       if ($180) {
        _abort();
        // unreachable;
       } else {
        HEAP32[$RP$1$i>>2] = 0;
        $R$3$i = $R$1$i;
        break;
       }
      } else {
       $159 = ((($v$0$i)) + 8|0);
       $160 = HEAP32[$159>>2]|0;
       $161 = ($160>>>0)<($150>>>0);
       if ($161) {
        _abort();
        // unreachable;
       }
       $162 = ((($160)) + 12|0);
       $163 = HEAP32[$162>>2]|0;
       $164 = ($163|0)==($v$0$i|0);
       if (!($164)) {
        _abort();
        // unreachable;
       }
       $165 = ((($157)) + 8|0);
       $166 = HEAP32[$165>>2]|0;
       $167 = ($166|0)==($v$0$i|0);
       if ($167) {
        HEAP32[$162>>2] = $157;
        HEAP32[$165>>2] = $160;
        $R$3$i = $157;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $181 = ($155|0)==(0|0);
     do {
      if (!($181)) {
       $182 = ((($v$0$i)) + 28|0);
       $183 = HEAP32[$182>>2]|0;
       $184 = (17676 + ($183<<2)|0);
       $185 = HEAP32[$184>>2]|0;
       $186 = ($v$0$i|0)==($185|0);
       if ($186) {
        HEAP32[$184>>2] = $R$3$i;
        $cond$i = ($R$3$i|0)==(0|0);
        if ($cond$i) {
         $187 = 1 << $183;
         $188 = $187 ^ -1;
         $189 = HEAP32[(17376)>>2]|0;
         $190 = $189 & $188;
         HEAP32[(17376)>>2] = $190;
         break;
        }
       } else {
        $191 = HEAP32[(17388)>>2]|0;
        $192 = ($155>>>0)<($191>>>0);
        if ($192) {
         _abort();
         // unreachable;
        }
        $193 = ((($155)) + 16|0);
        $194 = HEAP32[$193>>2]|0;
        $195 = ($194|0)==($v$0$i|0);
        if ($195) {
         HEAP32[$193>>2] = $R$3$i;
        } else {
         $196 = ((($155)) + 20|0);
         HEAP32[$196>>2] = $R$3$i;
        }
        $197 = ($R$3$i|0)==(0|0);
        if ($197) {
         break;
        }
       }
       $198 = HEAP32[(17388)>>2]|0;
       $199 = ($R$3$i>>>0)<($198>>>0);
       if ($199) {
        _abort();
        // unreachable;
       }
       $200 = ((($R$3$i)) + 24|0);
       HEAP32[$200>>2] = $155;
       $201 = ((($v$0$i)) + 16|0);
       $202 = HEAP32[$201>>2]|0;
       $203 = ($202|0)==(0|0);
       do {
        if (!($203)) {
         $204 = ($202>>>0)<($198>>>0);
         if ($204) {
          _abort();
          // unreachable;
         } else {
          $205 = ((($R$3$i)) + 16|0);
          HEAP32[$205>>2] = $202;
          $206 = ((($202)) + 24|0);
          HEAP32[$206>>2] = $R$3$i;
          break;
         }
        }
       } while(0);
       $207 = ((($v$0$i)) + 20|0);
       $208 = HEAP32[$207>>2]|0;
       $209 = ($208|0)==(0|0);
       if (!($209)) {
        $210 = HEAP32[(17388)>>2]|0;
        $211 = ($208>>>0)<($210>>>0);
        if ($211) {
         _abort();
         // unreachable;
        } else {
         $212 = ((($R$3$i)) + 20|0);
         HEAP32[$212>>2] = $208;
         $213 = ((($208)) + 24|0);
         HEAP32[$213>>2] = $R$3$i;
         break;
        }
       }
      }
     } while(0);
     $214 = ($rsize$0$i>>>0)<(16);
     if ($214) {
      $215 = (($rsize$0$i) + ($4))|0;
      $216 = $215 | 3;
      $217 = ((($v$0$i)) + 4|0);
      HEAP32[$217>>2] = $216;
      $218 = (($v$0$i) + ($215)|0);
      $219 = ((($218)) + 4|0);
      $220 = HEAP32[$219>>2]|0;
      $221 = $220 | 1;
      HEAP32[$219>>2] = $221;
     } else {
      $222 = $4 | 3;
      $223 = ((($v$0$i)) + 4|0);
      HEAP32[$223>>2] = $222;
      $224 = $rsize$0$i | 1;
      $225 = ((($152)) + 4|0);
      HEAP32[$225>>2] = $224;
      $226 = (($152) + ($rsize$0$i)|0);
      HEAP32[$226>>2] = $rsize$0$i;
      $227 = HEAP32[(17380)>>2]|0;
      $228 = ($227|0)==(0);
      if (!($228)) {
       $229 = HEAP32[(17392)>>2]|0;
       $230 = $227 >>> 3;
       $231 = $230 << 1;
       $232 = (17412 + ($231<<2)|0);
       $233 = HEAP32[4343]|0;
       $234 = 1 << $230;
       $235 = $233 & $234;
       $236 = ($235|0)==(0);
       if ($236) {
        $237 = $233 | $234;
        HEAP32[4343] = $237;
        $$pre$i = ((($232)) + 8|0);
        $$pre$phi$iZ2D = $$pre$i;$F1$0$i = $232;
       } else {
        $238 = ((($232)) + 8|0);
        $239 = HEAP32[$238>>2]|0;
        $240 = HEAP32[(17388)>>2]|0;
        $241 = ($239>>>0)<($240>>>0);
        if ($241) {
         _abort();
         // unreachable;
        } else {
         $$pre$phi$iZ2D = $238;$F1$0$i = $239;
        }
       }
       HEAP32[$$pre$phi$iZ2D>>2] = $229;
       $242 = ((($F1$0$i)) + 12|0);
       HEAP32[$242>>2] = $229;
       $243 = ((($229)) + 8|0);
       HEAP32[$243>>2] = $F1$0$i;
       $244 = ((($229)) + 12|0);
       HEAP32[$244>>2] = $232;
      }
      HEAP32[(17380)>>2] = $rsize$0$i;
      HEAP32[(17392)>>2] = $152;
     }
     $245 = ((($v$0$i)) + 8|0);
     $$0 = $245;
     return ($$0|0);
    }
   } else {
    $nb$0 = $4;
   }
  } else {
   $246 = ($bytes>>>0)>(4294967231);
   if ($246) {
    $nb$0 = -1;
   } else {
    $247 = (($bytes) + 11)|0;
    $248 = $247 & -8;
    $249 = HEAP32[(17376)>>2]|0;
    $250 = ($249|0)==(0);
    if ($250) {
     $nb$0 = $248;
    } else {
     $251 = (0 - ($248))|0;
     $252 = $247 >>> 8;
     $253 = ($252|0)==(0);
     if ($253) {
      $idx$0$i = 0;
     } else {
      $254 = ($248>>>0)>(16777215);
      if ($254) {
       $idx$0$i = 31;
      } else {
       $255 = (($252) + 1048320)|0;
       $256 = $255 >>> 16;
       $257 = $256 & 8;
       $258 = $252 << $257;
       $259 = (($258) + 520192)|0;
       $260 = $259 >>> 16;
       $261 = $260 & 4;
       $262 = $261 | $257;
       $263 = $258 << $261;
       $264 = (($263) + 245760)|0;
       $265 = $264 >>> 16;
       $266 = $265 & 2;
       $267 = $262 | $266;
       $268 = (14 - ($267))|0;
       $269 = $263 << $266;
       $270 = $269 >>> 15;
       $271 = (($268) + ($270))|0;
       $272 = $271 << 1;
       $273 = (($271) + 7)|0;
       $274 = $248 >>> $273;
       $275 = $274 & 1;
       $276 = $275 | $272;
       $idx$0$i = $276;
      }
     }
     $277 = (17676 + ($idx$0$i<<2)|0);
     $278 = HEAP32[$277>>2]|0;
     $279 = ($278|0)==(0|0);
     L123: do {
      if ($279) {
       $rsize$3$i = $251;$t$2$i = 0;$v$3$i = 0;
       label = 86;
      } else {
       $280 = ($idx$0$i|0)==(31);
       $281 = $idx$0$i >>> 1;
       $282 = (25 - ($281))|0;
       $283 = $280 ? 0 : $282;
       $284 = $248 << $283;
       $rsize$0$i5 = $251;$rst$0$i = 0;$sizebits$0$i = $284;$t$0$i4 = $278;$v$0$i6 = 0;
       while(1) {
        $285 = ((($t$0$i4)) + 4|0);
        $286 = HEAP32[$285>>2]|0;
        $287 = $286 & -8;
        $288 = (($287) - ($248))|0;
        $289 = ($288>>>0)<($rsize$0$i5>>>0);
        if ($289) {
         $290 = ($287|0)==($248|0);
         if ($290) {
          $rsize$412$i = $288;$t$411$i = $t$0$i4;$v$413$i = $t$0$i4;
          label = 90;
          break L123;
         } else {
          $rsize$1$i = $288;$v$1$i = $t$0$i4;
         }
        } else {
         $rsize$1$i = $rsize$0$i5;$v$1$i = $v$0$i6;
        }
        $291 = ((($t$0$i4)) + 20|0);
        $292 = HEAP32[$291>>2]|0;
        $293 = $sizebits$0$i >>> 31;
        $294 = (((($t$0$i4)) + 16|0) + ($293<<2)|0);
        $295 = HEAP32[$294>>2]|0;
        $296 = ($292|0)==(0|0);
        $297 = ($292|0)==($295|0);
        $or$cond1$i = $296 | $297;
        $rst$1$i = $or$cond1$i ? $rst$0$i : $292;
        $298 = ($295|0)==(0|0);
        $299 = $298&1;
        $300 = $299 ^ 1;
        $sizebits$0$$i = $sizebits$0$i << $300;
        if ($298) {
         $rsize$3$i = $rsize$1$i;$t$2$i = $rst$1$i;$v$3$i = $v$1$i;
         label = 86;
         break;
        } else {
         $rsize$0$i5 = $rsize$1$i;$rst$0$i = $rst$1$i;$sizebits$0$i = $sizebits$0$$i;$t$0$i4 = $295;$v$0$i6 = $v$1$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 86) {
      $301 = ($t$2$i|0)==(0|0);
      $302 = ($v$3$i|0)==(0|0);
      $or$cond$i = $301 & $302;
      if ($or$cond$i) {
       $303 = 2 << $idx$0$i;
       $304 = (0 - ($303))|0;
       $305 = $303 | $304;
       $306 = $249 & $305;
       $307 = ($306|0)==(0);
       if ($307) {
        $nb$0 = $248;
        break;
       }
       $308 = (0 - ($306))|0;
       $309 = $306 & $308;
       $310 = (($309) + -1)|0;
       $311 = $310 >>> 12;
       $312 = $311 & 16;
       $313 = $310 >>> $312;
       $314 = $313 >>> 5;
       $315 = $314 & 8;
       $316 = $315 | $312;
       $317 = $313 >>> $315;
       $318 = $317 >>> 2;
       $319 = $318 & 4;
       $320 = $316 | $319;
       $321 = $317 >>> $319;
       $322 = $321 >>> 1;
       $323 = $322 & 2;
       $324 = $320 | $323;
       $325 = $321 >>> $323;
       $326 = $325 >>> 1;
       $327 = $326 & 1;
       $328 = $324 | $327;
       $329 = $325 >>> $327;
       $330 = (($328) + ($329))|0;
       $331 = (17676 + ($330<<2)|0);
       $332 = HEAP32[$331>>2]|0;
       $t$4$ph$i = $332;
      } else {
       $t$4$ph$i = $t$2$i;
      }
      $333 = ($t$4$ph$i|0)==(0|0);
      if ($333) {
       $rsize$4$lcssa$i = $rsize$3$i;$v$4$lcssa$i = $v$3$i;
      } else {
       $rsize$412$i = $rsize$3$i;$t$411$i = $t$4$ph$i;$v$413$i = $v$3$i;
       label = 90;
      }
     }
     if ((label|0) == 90) {
      while(1) {
       label = 0;
       $334 = ((($t$411$i)) + 4|0);
       $335 = HEAP32[$334>>2]|0;
       $336 = $335 & -8;
       $337 = (($336) - ($248))|0;
       $338 = ($337>>>0)<($rsize$412$i>>>0);
       $$rsize$4$i = $338 ? $337 : $rsize$412$i;
       $t$4$v$4$i = $338 ? $t$411$i : $v$413$i;
       $339 = ((($t$411$i)) + 16|0);
       $340 = HEAP32[$339>>2]|0;
       $341 = ($340|0)==(0|0);
       if (!($341)) {
        $rsize$412$i = $$rsize$4$i;$t$411$i = $340;$v$413$i = $t$4$v$4$i;
        label = 90;
        continue;
       }
       $342 = ((($t$411$i)) + 20|0);
       $343 = HEAP32[$342>>2]|0;
       $344 = ($343|0)==(0|0);
       if ($344) {
        $rsize$4$lcssa$i = $$rsize$4$i;$v$4$lcssa$i = $t$4$v$4$i;
        break;
       } else {
        $rsize$412$i = $$rsize$4$i;$t$411$i = $343;$v$413$i = $t$4$v$4$i;
        label = 90;
       }
      }
     }
     $345 = ($v$4$lcssa$i|0)==(0|0);
     if ($345) {
      $nb$0 = $248;
     } else {
      $346 = HEAP32[(17380)>>2]|0;
      $347 = (($346) - ($248))|0;
      $348 = ($rsize$4$lcssa$i>>>0)<($347>>>0);
      if ($348) {
       $349 = HEAP32[(17388)>>2]|0;
       $350 = ($v$4$lcssa$i>>>0)<($349>>>0);
       if ($350) {
        _abort();
        // unreachable;
       }
       $351 = (($v$4$lcssa$i) + ($248)|0);
       $352 = ($v$4$lcssa$i>>>0)<($351>>>0);
       if (!($352)) {
        _abort();
        // unreachable;
       }
       $353 = ((($v$4$lcssa$i)) + 24|0);
       $354 = HEAP32[$353>>2]|0;
       $355 = ((($v$4$lcssa$i)) + 12|0);
       $356 = HEAP32[$355>>2]|0;
       $357 = ($356|0)==($v$4$lcssa$i|0);
       do {
        if ($357) {
         $367 = ((($v$4$lcssa$i)) + 20|0);
         $368 = HEAP32[$367>>2]|0;
         $369 = ($368|0)==(0|0);
         if ($369) {
          $370 = ((($v$4$lcssa$i)) + 16|0);
          $371 = HEAP32[$370>>2]|0;
          $372 = ($371|0)==(0|0);
          if ($372) {
           $R$3$i11 = 0;
           break;
          } else {
           $R$1$i9 = $371;$RP$1$i8 = $370;
          }
         } else {
          $R$1$i9 = $368;$RP$1$i8 = $367;
         }
         while(1) {
          $373 = ((($R$1$i9)) + 20|0);
          $374 = HEAP32[$373>>2]|0;
          $375 = ($374|0)==(0|0);
          if (!($375)) {
           $R$1$i9 = $374;$RP$1$i8 = $373;
           continue;
          }
          $376 = ((($R$1$i9)) + 16|0);
          $377 = HEAP32[$376>>2]|0;
          $378 = ($377|0)==(0|0);
          if ($378) {
           break;
          } else {
           $R$1$i9 = $377;$RP$1$i8 = $376;
          }
         }
         $379 = ($RP$1$i8>>>0)<($349>>>0);
         if ($379) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$RP$1$i8>>2] = 0;
          $R$3$i11 = $R$1$i9;
          break;
         }
        } else {
         $358 = ((($v$4$lcssa$i)) + 8|0);
         $359 = HEAP32[$358>>2]|0;
         $360 = ($359>>>0)<($349>>>0);
         if ($360) {
          _abort();
          // unreachable;
         }
         $361 = ((($359)) + 12|0);
         $362 = HEAP32[$361>>2]|0;
         $363 = ($362|0)==($v$4$lcssa$i|0);
         if (!($363)) {
          _abort();
          // unreachable;
         }
         $364 = ((($356)) + 8|0);
         $365 = HEAP32[$364>>2]|0;
         $366 = ($365|0)==($v$4$lcssa$i|0);
         if ($366) {
          HEAP32[$361>>2] = $356;
          HEAP32[$364>>2] = $359;
          $R$3$i11 = $356;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       } while(0);
       $380 = ($354|0)==(0|0);
       do {
        if (!($380)) {
         $381 = ((($v$4$lcssa$i)) + 28|0);
         $382 = HEAP32[$381>>2]|0;
         $383 = (17676 + ($382<<2)|0);
         $384 = HEAP32[$383>>2]|0;
         $385 = ($v$4$lcssa$i|0)==($384|0);
         if ($385) {
          HEAP32[$383>>2] = $R$3$i11;
          $cond$i12 = ($R$3$i11|0)==(0|0);
          if ($cond$i12) {
           $386 = 1 << $382;
           $387 = $386 ^ -1;
           $388 = HEAP32[(17376)>>2]|0;
           $389 = $388 & $387;
           HEAP32[(17376)>>2] = $389;
           break;
          }
         } else {
          $390 = HEAP32[(17388)>>2]|0;
          $391 = ($354>>>0)<($390>>>0);
          if ($391) {
           _abort();
           // unreachable;
          }
          $392 = ((($354)) + 16|0);
          $393 = HEAP32[$392>>2]|0;
          $394 = ($393|0)==($v$4$lcssa$i|0);
          if ($394) {
           HEAP32[$392>>2] = $R$3$i11;
          } else {
           $395 = ((($354)) + 20|0);
           HEAP32[$395>>2] = $R$3$i11;
          }
          $396 = ($R$3$i11|0)==(0|0);
          if ($396) {
           break;
          }
         }
         $397 = HEAP32[(17388)>>2]|0;
         $398 = ($R$3$i11>>>0)<($397>>>0);
         if ($398) {
          _abort();
          // unreachable;
         }
         $399 = ((($R$3$i11)) + 24|0);
         HEAP32[$399>>2] = $354;
         $400 = ((($v$4$lcssa$i)) + 16|0);
         $401 = HEAP32[$400>>2]|0;
         $402 = ($401|0)==(0|0);
         do {
          if (!($402)) {
           $403 = ($401>>>0)<($397>>>0);
           if ($403) {
            _abort();
            // unreachable;
           } else {
            $404 = ((($R$3$i11)) + 16|0);
            HEAP32[$404>>2] = $401;
            $405 = ((($401)) + 24|0);
            HEAP32[$405>>2] = $R$3$i11;
            break;
           }
          }
         } while(0);
         $406 = ((($v$4$lcssa$i)) + 20|0);
         $407 = HEAP32[$406>>2]|0;
         $408 = ($407|0)==(0|0);
         if (!($408)) {
          $409 = HEAP32[(17388)>>2]|0;
          $410 = ($407>>>0)<($409>>>0);
          if ($410) {
           _abort();
           // unreachable;
          } else {
           $411 = ((($R$3$i11)) + 20|0);
           HEAP32[$411>>2] = $407;
           $412 = ((($407)) + 24|0);
           HEAP32[$412>>2] = $R$3$i11;
           break;
          }
         }
        }
       } while(0);
       $413 = ($rsize$4$lcssa$i>>>0)<(16);
       do {
        if ($413) {
         $414 = (($rsize$4$lcssa$i) + ($248))|0;
         $415 = $414 | 3;
         $416 = ((($v$4$lcssa$i)) + 4|0);
         HEAP32[$416>>2] = $415;
         $417 = (($v$4$lcssa$i) + ($414)|0);
         $418 = ((($417)) + 4|0);
         $419 = HEAP32[$418>>2]|0;
         $420 = $419 | 1;
         HEAP32[$418>>2] = $420;
        } else {
         $421 = $248 | 3;
         $422 = ((($v$4$lcssa$i)) + 4|0);
         HEAP32[$422>>2] = $421;
         $423 = $rsize$4$lcssa$i | 1;
         $424 = ((($351)) + 4|0);
         HEAP32[$424>>2] = $423;
         $425 = (($351) + ($rsize$4$lcssa$i)|0);
         HEAP32[$425>>2] = $rsize$4$lcssa$i;
         $426 = $rsize$4$lcssa$i >>> 3;
         $427 = ($rsize$4$lcssa$i>>>0)<(256);
         if ($427) {
          $428 = $426 << 1;
          $429 = (17412 + ($428<<2)|0);
          $430 = HEAP32[4343]|0;
          $431 = 1 << $426;
          $432 = $430 & $431;
          $433 = ($432|0)==(0);
          if ($433) {
           $434 = $430 | $431;
           HEAP32[4343] = $434;
           $$pre$i13 = ((($429)) + 8|0);
           $$pre$phi$i14Z2D = $$pre$i13;$F5$0$i = $429;
          } else {
           $435 = ((($429)) + 8|0);
           $436 = HEAP32[$435>>2]|0;
           $437 = HEAP32[(17388)>>2]|0;
           $438 = ($436>>>0)<($437>>>0);
           if ($438) {
            _abort();
            // unreachable;
           } else {
            $$pre$phi$i14Z2D = $435;$F5$0$i = $436;
           }
          }
          HEAP32[$$pre$phi$i14Z2D>>2] = $351;
          $439 = ((($F5$0$i)) + 12|0);
          HEAP32[$439>>2] = $351;
          $440 = ((($351)) + 8|0);
          HEAP32[$440>>2] = $F5$0$i;
          $441 = ((($351)) + 12|0);
          HEAP32[$441>>2] = $429;
          break;
         }
         $442 = $rsize$4$lcssa$i >>> 8;
         $443 = ($442|0)==(0);
         if ($443) {
          $I7$0$i = 0;
         } else {
          $444 = ($rsize$4$lcssa$i>>>0)>(16777215);
          if ($444) {
           $I7$0$i = 31;
          } else {
           $445 = (($442) + 1048320)|0;
           $446 = $445 >>> 16;
           $447 = $446 & 8;
           $448 = $442 << $447;
           $449 = (($448) + 520192)|0;
           $450 = $449 >>> 16;
           $451 = $450 & 4;
           $452 = $451 | $447;
           $453 = $448 << $451;
           $454 = (($453) + 245760)|0;
           $455 = $454 >>> 16;
           $456 = $455 & 2;
           $457 = $452 | $456;
           $458 = (14 - ($457))|0;
           $459 = $453 << $456;
           $460 = $459 >>> 15;
           $461 = (($458) + ($460))|0;
           $462 = $461 << 1;
           $463 = (($461) + 7)|0;
           $464 = $rsize$4$lcssa$i >>> $463;
           $465 = $464 & 1;
           $466 = $465 | $462;
           $I7$0$i = $466;
          }
         }
         $467 = (17676 + ($I7$0$i<<2)|0);
         $468 = ((($351)) + 28|0);
         HEAP32[$468>>2] = $I7$0$i;
         $469 = ((($351)) + 16|0);
         $470 = ((($469)) + 4|0);
         HEAP32[$470>>2] = 0;
         HEAP32[$469>>2] = 0;
         $471 = HEAP32[(17376)>>2]|0;
         $472 = 1 << $I7$0$i;
         $473 = $471 & $472;
         $474 = ($473|0)==(0);
         if ($474) {
          $475 = $471 | $472;
          HEAP32[(17376)>>2] = $475;
          HEAP32[$467>>2] = $351;
          $476 = ((($351)) + 24|0);
          HEAP32[$476>>2] = $467;
          $477 = ((($351)) + 12|0);
          HEAP32[$477>>2] = $351;
          $478 = ((($351)) + 8|0);
          HEAP32[$478>>2] = $351;
          break;
         }
         $479 = HEAP32[$467>>2]|0;
         $480 = ($I7$0$i|0)==(31);
         $481 = $I7$0$i >>> 1;
         $482 = (25 - ($481))|0;
         $483 = $480 ? 0 : $482;
         $484 = $rsize$4$lcssa$i << $483;
         $K12$0$i = $484;$T$0$i = $479;
         while(1) {
          $485 = ((($T$0$i)) + 4|0);
          $486 = HEAP32[$485>>2]|0;
          $487 = $486 & -8;
          $488 = ($487|0)==($rsize$4$lcssa$i|0);
          if ($488) {
           label = 148;
           break;
          }
          $489 = $K12$0$i >>> 31;
          $490 = (((($T$0$i)) + 16|0) + ($489<<2)|0);
          $491 = $K12$0$i << 1;
          $492 = HEAP32[$490>>2]|0;
          $493 = ($492|0)==(0|0);
          if ($493) {
           label = 145;
           break;
          } else {
           $K12$0$i = $491;$T$0$i = $492;
          }
         }
         if ((label|0) == 145) {
          $494 = HEAP32[(17388)>>2]|0;
          $495 = ($490>>>0)<($494>>>0);
          if ($495) {
           _abort();
           // unreachable;
          } else {
           HEAP32[$490>>2] = $351;
           $496 = ((($351)) + 24|0);
           HEAP32[$496>>2] = $T$0$i;
           $497 = ((($351)) + 12|0);
           HEAP32[$497>>2] = $351;
           $498 = ((($351)) + 8|0);
           HEAP32[$498>>2] = $351;
           break;
          }
         }
         else if ((label|0) == 148) {
          $499 = ((($T$0$i)) + 8|0);
          $500 = HEAP32[$499>>2]|0;
          $501 = HEAP32[(17388)>>2]|0;
          $502 = ($500>>>0)>=($501>>>0);
          $not$7$i = ($T$0$i>>>0)>=($501>>>0);
          $503 = $502 & $not$7$i;
          if ($503) {
           $504 = ((($500)) + 12|0);
           HEAP32[$504>>2] = $351;
           HEAP32[$499>>2] = $351;
           $505 = ((($351)) + 8|0);
           HEAP32[$505>>2] = $500;
           $506 = ((($351)) + 12|0);
           HEAP32[$506>>2] = $T$0$i;
           $507 = ((($351)) + 24|0);
           HEAP32[$507>>2] = 0;
           break;
          } else {
           _abort();
           // unreachable;
          }
         }
        }
       } while(0);
       $508 = ((($v$4$lcssa$i)) + 8|0);
       $$0 = $508;
       return ($$0|0);
      } else {
       $nb$0 = $248;
      }
     }
    }
   }
  }
 } while(0);
 $509 = HEAP32[(17380)>>2]|0;
 $510 = ($509>>>0)<($nb$0>>>0);
 if (!($510)) {
  $511 = (($509) - ($nb$0))|0;
  $512 = HEAP32[(17392)>>2]|0;
  $513 = ($511>>>0)>(15);
  if ($513) {
   $514 = (($512) + ($nb$0)|0);
   HEAP32[(17392)>>2] = $514;
   HEAP32[(17380)>>2] = $511;
   $515 = $511 | 1;
   $516 = ((($514)) + 4|0);
   HEAP32[$516>>2] = $515;
   $517 = (($514) + ($511)|0);
   HEAP32[$517>>2] = $511;
   $518 = $nb$0 | 3;
   $519 = ((($512)) + 4|0);
   HEAP32[$519>>2] = $518;
  } else {
   HEAP32[(17380)>>2] = 0;
   HEAP32[(17392)>>2] = 0;
   $520 = $509 | 3;
   $521 = ((($512)) + 4|0);
   HEAP32[$521>>2] = $520;
   $522 = (($512) + ($509)|0);
   $523 = ((($522)) + 4|0);
   $524 = HEAP32[$523>>2]|0;
   $525 = $524 | 1;
   HEAP32[$523>>2] = $525;
  }
  $526 = ((($512)) + 8|0);
  $$0 = $526;
  return ($$0|0);
 }
 $527 = HEAP32[(17384)>>2]|0;
 $528 = ($527>>>0)>($nb$0>>>0);
 if ($528) {
  $529 = (($527) - ($nb$0))|0;
  HEAP32[(17384)>>2] = $529;
  $530 = HEAP32[(17396)>>2]|0;
  $531 = (($530) + ($nb$0)|0);
  HEAP32[(17396)>>2] = $531;
  $532 = $529 | 1;
  $533 = ((($531)) + 4|0);
  HEAP32[$533>>2] = $532;
  $534 = $nb$0 | 3;
  $535 = ((($530)) + 4|0);
  HEAP32[$535>>2] = $534;
  $536 = ((($530)) + 8|0);
  $$0 = $536;
  return ($$0|0);
 }
 $537 = HEAP32[4461]|0;
 $538 = ($537|0)==(0);
 do {
  if ($538) {
   $539 = (_sysconf(30)|0);
   $540 = (($539) + -1)|0;
   $541 = $540 & $539;
   $542 = ($541|0)==(0);
   if ($542) {
    HEAP32[(17852)>>2] = $539;
    HEAP32[(17848)>>2] = $539;
    HEAP32[(17856)>>2] = -1;
    HEAP32[(17860)>>2] = -1;
    HEAP32[(17864)>>2] = 0;
    HEAP32[(17816)>>2] = 0;
    $543 = (_time((0|0))|0);
    $544 = $543 & -16;
    $545 = $544 ^ 1431655768;
    HEAP32[4461] = $545;
    break;
   } else {
    _abort();
    // unreachable;
   }
  }
 } while(0);
 $546 = (($nb$0) + 48)|0;
 $547 = HEAP32[(17852)>>2]|0;
 $548 = (($nb$0) + 47)|0;
 $549 = (($547) + ($548))|0;
 $550 = (0 - ($547))|0;
 $551 = $549 & $550;
 $552 = ($551>>>0)>($nb$0>>>0);
 if (!($552)) {
  $$0 = 0;
  return ($$0|0);
 }
 $553 = HEAP32[(17812)>>2]|0;
 $554 = ($553|0)==(0);
 if (!($554)) {
  $555 = HEAP32[(17804)>>2]|0;
  $556 = (($555) + ($551))|0;
  $557 = ($556>>>0)<=($555>>>0);
  $558 = ($556>>>0)>($553>>>0);
  $or$cond1$i16 = $557 | $558;
  if ($or$cond1$i16) {
   $$0 = 0;
   return ($$0|0);
  }
 }
 $559 = HEAP32[(17816)>>2]|0;
 $560 = $559 & 4;
 $561 = ($560|0)==(0);
 L257: do {
  if ($561) {
   $562 = HEAP32[(17396)>>2]|0;
   $563 = ($562|0)==(0|0);
   L259: do {
    if ($563) {
     label = 173;
    } else {
     $sp$0$i$i = (17820);
     while(1) {
      $564 = HEAP32[$sp$0$i$i>>2]|0;
      $565 = ($564>>>0)>($562>>>0);
      if (!($565)) {
       $566 = ((($sp$0$i$i)) + 4|0);
       $567 = HEAP32[$566>>2]|0;
       $568 = (($564) + ($567)|0);
       $569 = ($568>>>0)>($562>>>0);
       if ($569) {
        break;
       }
      }
      $570 = ((($sp$0$i$i)) + 8|0);
      $571 = HEAP32[$570>>2]|0;
      $572 = ($571|0)==(0|0);
      if ($572) {
       label = 173;
       break L259;
      } else {
       $sp$0$i$i = $571;
      }
     }
     $595 = HEAP32[(17384)>>2]|0;
     $596 = (($549) - ($595))|0;
     $597 = $596 & $550;
     $598 = ($597>>>0)<(2147483647);
     if ($598) {
      $599 = (_sbrk(($597|0))|0);
      $600 = HEAP32[$sp$0$i$i>>2]|0;
      $601 = HEAP32[$566>>2]|0;
      $602 = (($600) + ($601)|0);
      $603 = ($599|0)==($602|0);
      if ($603) {
       $604 = ($599|0)==((-1)|0);
       if (!($604)) {
        $tbase$746$i = $599;$tsize$745$i = $597;
        label = 193;
        break L257;
       }
      } else {
       $br$2$ph$i = $599;$ssize$2$ph$i = $597;
       label = 183;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 173) {
     $573 = (_sbrk(0)|0);
     $574 = ($573|0)==((-1)|0);
     if (!($574)) {
      $575 = $573;
      $576 = HEAP32[(17848)>>2]|0;
      $577 = (($576) + -1)|0;
      $578 = $577 & $575;
      $579 = ($578|0)==(0);
      if ($579) {
       $ssize$0$i = $551;
      } else {
       $580 = (($577) + ($575))|0;
       $581 = (0 - ($576))|0;
       $582 = $580 & $581;
       $583 = (($551) - ($575))|0;
       $584 = (($583) + ($582))|0;
       $ssize$0$i = $584;
      }
      $585 = HEAP32[(17804)>>2]|0;
      $586 = (($585) + ($ssize$0$i))|0;
      $587 = ($ssize$0$i>>>0)>($nb$0>>>0);
      $588 = ($ssize$0$i>>>0)<(2147483647);
      $or$cond$i17 = $587 & $588;
      if ($or$cond$i17) {
       $589 = HEAP32[(17812)>>2]|0;
       $590 = ($589|0)==(0);
       if (!($590)) {
        $591 = ($586>>>0)<=($585>>>0);
        $592 = ($586>>>0)>($589>>>0);
        $or$cond2$i = $591 | $592;
        if ($or$cond2$i) {
         break;
        }
       }
       $593 = (_sbrk(($ssize$0$i|0))|0);
       $594 = ($593|0)==($573|0);
       if ($594) {
        $tbase$746$i = $573;$tsize$745$i = $ssize$0$i;
        label = 193;
        break L257;
       } else {
        $br$2$ph$i = $593;$ssize$2$ph$i = $ssize$0$i;
        label = 183;
       }
      }
     }
    }
   } while(0);
   L279: do {
    if ((label|0) == 183) {
     $605 = (0 - ($ssize$2$ph$i))|0;
     $606 = ($br$2$ph$i|0)!=((-1)|0);
     $607 = ($ssize$2$ph$i>>>0)<(2147483647);
     $or$cond7$i = $607 & $606;
     $608 = ($546>>>0)>($ssize$2$ph$i>>>0);
     $or$cond8$i = $608 & $or$cond7$i;
     do {
      if ($or$cond8$i) {
       $609 = HEAP32[(17852)>>2]|0;
       $610 = (($548) - ($ssize$2$ph$i))|0;
       $611 = (($610) + ($609))|0;
       $612 = (0 - ($609))|0;
       $613 = $611 & $612;
       $614 = ($613>>>0)<(2147483647);
       if ($614) {
        $615 = (_sbrk(($613|0))|0);
        $616 = ($615|0)==((-1)|0);
        if ($616) {
         (_sbrk(($605|0))|0);
         break L279;
        } else {
         $617 = (($613) + ($ssize$2$ph$i))|0;
         $ssize$5$i = $617;
         break;
        }
       } else {
        $ssize$5$i = $ssize$2$ph$i;
       }
      } else {
       $ssize$5$i = $ssize$2$ph$i;
      }
     } while(0);
     $618 = ($br$2$ph$i|0)==((-1)|0);
     if (!($618)) {
      $tbase$746$i = $br$2$ph$i;$tsize$745$i = $ssize$5$i;
      label = 193;
      break L257;
     }
    }
   } while(0);
   $619 = HEAP32[(17816)>>2]|0;
   $620 = $619 | 4;
   HEAP32[(17816)>>2] = $620;
   label = 190;
  } else {
   label = 190;
  }
 } while(0);
 if ((label|0) == 190) {
  $621 = ($551>>>0)<(2147483647);
  if ($621) {
   $622 = (_sbrk(($551|0))|0);
   $623 = (_sbrk(0)|0);
   $624 = ($622|0)!=((-1)|0);
   $625 = ($623|0)!=((-1)|0);
   $or$cond5$i = $624 & $625;
   $626 = ($622>>>0)<($623>>>0);
   $or$cond10$i = $626 & $or$cond5$i;
   if ($or$cond10$i) {
    $627 = $623;
    $628 = $622;
    $629 = (($627) - ($628))|0;
    $630 = (($nb$0) + 40)|0;
    $$not$i = ($629>>>0)>($630>>>0);
    if ($$not$i) {
     $tbase$746$i = $622;$tsize$745$i = $629;
     label = 193;
    }
   }
  }
 }
 if ((label|0) == 193) {
  $631 = HEAP32[(17804)>>2]|0;
  $632 = (($631) + ($tsize$745$i))|0;
  HEAP32[(17804)>>2] = $632;
  $633 = HEAP32[(17808)>>2]|0;
  $634 = ($632>>>0)>($633>>>0);
  if ($634) {
   HEAP32[(17808)>>2] = $632;
  }
  $635 = HEAP32[(17396)>>2]|0;
  $636 = ($635|0)==(0|0);
  do {
   if ($636) {
    $637 = HEAP32[(17388)>>2]|0;
    $638 = ($637|0)==(0|0);
    $639 = ($tbase$746$i>>>0)<($637>>>0);
    $or$cond11$i = $638 | $639;
    if ($or$cond11$i) {
     HEAP32[(17388)>>2] = $tbase$746$i;
    }
    HEAP32[(17820)>>2] = $tbase$746$i;
    HEAP32[(17824)>>2] = $tsize$745$i;
    HEAP32[(17832)>>2] = 0;
    $640 = HEAP32[4461]|0;
    HEAP32[(17408)>>2] = $640;
    HEAP32[(17404)>>2] = -1;
    $i$01$i$i = 0;
    while(1) {
     $641 = $i$01$i$i << 1;
     $642 = (17412 + ($641<<2)|0);
     $643 = ((($642)) + 12|0);
     HEAP32[$643>>2] = $642;
     $644 = ((($642)) + 8|0);
     HEAP32[$644>>2] = $642;
     $645 = (($i$01$i$i) + 1)|0;
     $exitcond$i$i = ($645|0)==(32);
     if ($exitcond$i$i) {
      break;
     } else {
      $i$01$i$i = $645;
     }
    }
    $646 = (($tsize$745$i) + -40)|0;
    $647 = ((($tbase$746$i)) + 8|0);
    $648 = $647;
    $649 = $648 & 7;
    $650 = ($649|0)==(0);
    $651 = (0 - ($648))|0;
    $652 = $651 & 7;
    $653 = $650 ? 0 : $652;
    $654 = (($tbase$746$i) + ($653)|0);
    $655 = (($646) - ($653))|0;
    HEAP32[(17396)>>2] = $654;
    HEAP32[(17384)>>2] = $655;
    $656 = $655 | 1;
    $657 = ((($654)) + 4|0);
    HEAP32[$657>>2] = $656;
    $658 = (($654) + ($655)|0);
    $659 = ((($658)) + 4|0);
    HEAP32[$659>>2] = 40;
    $660 = HEAP32[(17860)>>2]|0;
    HEAP32[(17400)>>2] = $660;
   } else {
    $sp$068$i = (17820);
    while(1) {
     $661 = HEAP32[$sp$068$i>>2]|0;
     $662 = ((($sp$068$i)) + 4|0);
     $663 = HEAP32[$662>>2]|0;
     $664 = (($661) + ($663)|0);
     $665 = ($tbase$746$i|0)==($664|0);
     if ($665) {
      label = 203;
      break;
     }
     $666 = ((($sp$068$i)) + 8|0);
     $667 = HEAP32[$666>>2]|0;
     $668 = ($667|0)==(0|0);
     if ($668) {
      break;
     } else {
      $sp$068$i = $667;
     }
    }
    if ((label|0) == 203) {
     $669 = ((($sp$068$i)) + 12|0);
     $670 = HEAP32[$669>>2]|0;
     $671 = $670 & 8;
     $672 = ($671|0)==(0);
     if ($672) {
      $673 = ($635>>>0)>=($661>>>0);
      $674 = ($635>>>0)<($tbase$746$i>>>0);
      $or$cond48$i = $674 & $673;
      if ($or$cond48$i) {
       $675 = (($663) + ($tsize$745$i))|0;
       HEAP32[$662>>2] = $675;
       $676 = HEAP32[(17384)>>2]|0;
       $677 = ((($635)) + 8|0);
       $678 = $677;
       $679 = $678 & 7;
       $680 = ($679|0)==(0);
       $681 = (0 - ($678))|0;
       $682 = $681 & 7;
       $683 = $680 ? 0 : $682;
       $684 = (($635) + ($683)|0);
       $685 = (($tsize$745$i) - ($683))|0;
       $686 = (($685) + ($676))|0;
       HEAP32[(17396)>>2] = $684;
       HEAP32[(17384)>>2] = $686;
       $687 = $686 | 1;
       $688 = ((($684)) + 4|0);
       HEAP32[$688>>2] = $687;
       $689 = (($684) + ($686)|0);
       $690 = ((($689)) + 4|0);
       HEAP32[$690>>2] = 40;
       $691 = HEAP32[(17860)>>2]|0;
       HEAP32[(17400)>>2] = $691;
       break;
      }
     }
    }
    $692 = HEAP32[(17388)>>2]|0;
    $693 = ($tbase$746$i>>>0)<($692>>>0);
    if ($693) {
     HEAP32[(17388)>>2] = $tbase$746$i;
     $757 = $tbase$746$i;
    } else {
     $757 = $692;
    }
    $694 = (($tbase$746$i) + ($tsize$745$i)|0);
    $sp$167$i = (17820);
    while(1) {
     $695 = HEAP32[$sp$167$i>>2]|0;
     $696 = ($695|0)==($694|0);
     if ($696) {
      label = 211;
      break;
     }
     $697 = ((($sp$167$i)) + 8|0);
     $698 = HEAP32[$697>>2]|0;
     $699 = ($698|0)==(0|0);
     if ($699) {
      $sp$0$i$i$i = (17820);
      break;
     } else {
      $sp$167$i = $698;
     }
    }
    if ((label|0) == 211) {
     $700 = ((($sp$167$i)) + 12|0);
     $701 = HEAP32[$700>>2]|0;
     $702 = $701 & 8;
     $703 = ($702|0)==(0);
     if ($703) {
      HEAP32[$sp$167$i>>2] = $tbase$746$i;
      $704 = ((($sp$167$i)) + 4|0);
      $705 = HEAP32[$704>>2]|0;
      $706 = (($705) + ($tsize$745$i))|0;
      HEAP32[$704>>2] = $706;
      $707 = ((($tbase$746$i)) + 8|0);
      $708 = $707;
      $709 = $708 & 7;
      $710 = ($709|0)==(0);
      $711 = (0 - ($708))|0;
      $712 = $711 & 7;
      $713 = $710 ? 0 : $712;
      $714 = (($tbase$746$i) + ($713)|0);
      $715 = ((($694)) + 8|0);
      $716 = $715;
      $717 = $716 & 7;
      $718 = ($717|0)==(0);
      $719 = (0 - ($716))|0;
      $720 = $719 & 7;
      $721 = $718 ? 0 : $720;
      $722 = (($694) + ($721)|0);
      $723 = $722;
      $724 = $714;
      $725 = (($723) - ($724))|0;
      $726 = (($714) + ($nb$0)|0);
      $727 = (($725) - ($nb$0))|0;
      $728 = $nb$0 | 3;
      $729 = ((($714)) + 4|0);
      HEAP32[$729>>2] = $728;
      $730 = ($722|0)==($635|0);
      do {
       if ($730) {
        $731 = HEAP32[(17384)>>2]|0;
        $732 = (($731) + ($727))|0;
        HEAP32[(17384)>>2] = $732;
        HEAP32[(17396)>>2] = $726;
        $733 = $732 | 1;
        $734 = ((($726)) + 4|0);
        HEAP32[$734>>2] = $733;
       } else {
        $735 = HEAP32[(17392)>>2]|0;
        $736 = ($722|0)==($735|0);
        if ($736) {
         $737 = HEAP32[(17380)>>2]|0;
         $738 = (($737) + ($727))|0;
         HEAP32[(17380)>>2] = $738;
         HEAP32[(17392)>>2] = $726;
         $739 = $738 | 1;
         $740 = ((($726)) + 4|0);
         HEAP32[$740>>2] = $739;
         $741 = (($726) + ($738)|0);
         HEAP32[$741>>2] = $738;
         break;
        }
        $742 = ((($722)) + 4|0);
        $743 = HEAP32[$742>>2]|0;
        $744 = $743 & 3;
        $745 = ($744|0)==(1);
        if ($745) {
         $746 = $743 & -8;
         $747 = $743 >>> 3;
         $748 = ($743>>>0)<(256);
         L331: do {
          if ($748) {
           $749 = ((($722)) + 8|0);
           $750 = HEAP32[$749>>2]|0;
           $751 = ((($722)) + 12|0);
           $752 = HEAP32[$751>>2]|0;
           $753 = $747 << 1;
           $754 = (17412 + ($753<<2)|0);
           $755 = ($750|0)==($754|0);
           do {
            if (!($755)) {
             $756 = ($750>>>0)<($757>>>0);
             if ($756) {
              _abort();
              // unreachable;
             }
             $758 = ((($750)) + 12|0);
             $759 = HEAP32[$758>>2]|0;
             $760 = ($759|0)==($722|0);
             if ($760) {
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $761 = ($752|0)==($750|0);
           if ($761) {
            $762 = 1 << $747;
            $763 = $762 ^ -1;
            $764 = HEAP32[4343]|0;
            $765 = $764 & $763;
            HEAP32[4343] = $765;
            break;
           }
           $766 = ($752|0)==($754|0);
           do {
            if ($766) {
             $$pre9$i$i = ((($752)) + 8|0);
             $$pre$phi10$i$iZ2D = $$pre9$i$i;
            } else {
             $767 = ($752>>>0)<($757>>>0);
             if ($767) {
              _abort();
              // unreachable;
             }
             $768 = ((($752)) + 8|0);
             $769 = HEAP32[$768>>2]|0;
             $770 = ($769|0)==($722|0);
             if ($770) {
              $$pre$phi10$i$iZ2D = $768;
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $771 = ((($750)) + 12|0);
           HEAP32[$771>>2] = $752;
           HEAP32[$$pre$phi10$i$iZ2D>>2] = $750;
          } else {
           $772 = ((($722)) + 24|0);
           $773 = HEAP32[$772>>2]|0;
           $774 = ((($722)) + 12|0);
           $775 = HEAP32[$774>>2]|0;
           $776 = ($775|0)==($722|0);
           do {
            if ($776) {
             $786 = ((($722)) + 16|0);
             $787 = ((($786)) + 4|0);
             $788 = HEAP32[$787>>2]|0;
             $789 = ($788|0)==(0|0);
             if ($789) {
              $790 = HEAP32[$786>>2]|0;
              $791 = ($790|0)==(0|0);
              if ($791) {
               $R$3$i$i = 0;
               break;
              } else {
               $R$1$i$i = $790;$RP$1$i$i = $786;
              }
             } else {
              $R$1$i$i = $788;$RP$1$i$i = $787;
             }
             while(1) {
              $792 = ((($R$1$i$i)) + 20|0);
              $793 = HEAP32[$792>>2]|0;
              $794 = ($793|0)==(0|0);
              if (!($794)) {
               $R$1$i$i = $793;$RP$1$i$i = $792;
               continue;
              }
              $795 = ((($R$1$i$i)) + 16|0);
              $796 = HEAP32[$795>>2]|0;
              $797 = ($796|0)==(0|0);
              if ($797) {
               break;
              } else {
               $R$1$i$i = $796;$RP$1$i$i = $795;
              }
             }
             $798 = ($RP$1$i$i>>>0)<($757>>>0);
             if ($798) {
              _abort();
              // unreachable;
             } else {
              HEAP32[$RP$1$i$i>>2] = 0;
              $R$3$i$i = $R$1$i$i;
              break;
             }
            } else {
             $777 = ((($722)) + 8|0);
             $778 = HEAP32[$777>>2]|0;
             $779 = ($778>>>0)<($757>>>0);
             if ($779) {
              _abort();
              // unreachable;
             }
             $780 = ((($778)) + 12|0);
             $781 = HEAP32[$780>>2]|0;
             $782 = ($781|0)==($722|0);
             if (!($782)) {
              _abort();
              // unreachable;
             }
             $783 = ((($775)) + 8|0);
             $784 = HEAP32[$783>>2]|0;
             $785 = ($784|0)==($722|0);
             if ($785) {
              HEAP32[$780>>2] = $775;
              HEAP32[$783>>2] = $778;
              $R$3$i$i = $775;
              break;
             } else {
              _abort();
              // unreachable;
             }
            }
           } while(0);
           $799 = ($773|0)==(0|0);
           if ($799) {
            break;
           }
           $800 = ((($722)) + 28|0);
           $801 = HEAP32[$800>>2]|0;
           $802 = (17676 + ($801<<2)|0);
           $803 = HEAP32[$802>>2]|0;
           $804 = ($722|0)==($803|0);
           do {
            if ($804) {
             HEAP32[$802>>2] = $R$3$i$i;
             $cond$i$i = ($R$3$i$i|0)==(0|0);
             if (!($cond$i$i)) {
              break;
             }
             $805 = 1 << $801;
             $806 = $805 ^ -1;
             $807 = HEAP32[(17376)>>2]|0;
             $808 = $807 & $806;
             HEAP32[(17376)>>2] = $808;
             break L331;
            } else {
             $809 = HEAP32[(17388)>>2]|0;
             $810 = ($773>>>0)<($809>>>0);
             if ($810) {
              _abort();
              // unreachable;
             }
             $811 = ((($773)) + 16|0);
             $812 = HEAP32[$811>>2]|0;
             $813 = ($812|0)==($722|0);
             if ($813) {
              HEAP32[$811>>2] = $R$3$i$i;
             } else {
              $814 = ((($773)) + 20|0);
              HEAP32[$814>>2] = $R$3$i$i;
             }
             $815 = ($R$3$i$i|0)==(0|0);
             if ($815) {
              break L331;
             }
            }
           } while(0);
           $816 = HEAP32[(17388)>>2]|0;
           $817 = ($R$3$i$i>>>0)<($816>>>0);
           if ($817) {
            _abort();
            // unreachable;
           }
           $818 = ((($R$3$i$i)) + 24|0);
           HEAP32[$818>>2] = $773;
           $819 = ((($722)) + 16|0);
           $820 = HEAP32[$819>>2]|0;
           $821 = ($820|0)==(0|0);
           do {
            if (!($821)) {
             $822 = ($820>>>0)<($816>>>0);
             if ($822) {
              _abort();
              // unreachable;
             } else {
              $823 = ((($R$3$i$i)) + 16|0);
              HEAP32[$823>>2] = $820;
              $824 = ((($820)) + 24|0);
              HEAP32[$824>>2] = $R$3$i$i;
              break;
             }
            }
           } while(0);
           $825 = ((($819)) + 4|0);
           $826 = HEAP32[$825>>2]|0;
           $827 = ($826|0)==(0|0);
           if ($827) {
            break;
           }
           $828 = HEAP32[(17388)>>2]|0;
           $829 = ($826>>>0)<($828>>>0);
           if ($829) {
            _abort();
            // unreachable;
           } else {
            $830 = ((($R$3$i$i)) + 20|0);
            HEAP32[$830>>2] = $826;
            $831 = ((($826)) + 24|0);
            HEAP32[$831>>2] = $R$3$i$i;
            break;
           }
          }
         } while(0);
         $832 = (($722) + ($746)|0);
         $833 = (($746) + ($727))|0;
         $oldfirst$0$i$i = $832;$qsize$0$i$i = $833;
        } else {
         $oldfirst$0$i$i = $722;$qsize$0$i$i = $727;
        }
        $834 = ((($oldfirst$0$i$i)) + 4|0);
        $835 = HEAP32[$834>>2]|0;
        $836 = $835 & -2;
        HEAP32[$834>>2] = $836;
        $837 = $qsize$0$i$i | 1;
        $838 = ((($726)) + 4|0);
        HEAP32[$838>>2] = $837;
        $839 = (($726) + ($qsize$0$i$i)|0);
        HEAP32[$839>>2] = $qsize$0$i$i;
        $840 = $qsize$0$i$i >>> 3;
        $841 = ($qsize$0$i$i>>>0)<(256);
        if ($841) {
         $842 = $840 << 1;
         $843 = (17412 + ($842<<2)|0);
         $844 = HEAP32[4343]|0;
         $845 = 1 << $840;
         $846 = $844 & $845;
         $847 = ($846|0)==(0);
         do {
          if ($847) {
           $848 = $844 | $845;
           HEAP32[4343] = $848;
           $$pre$i16$i = ((($843)) + 8|0);
           $$pre$phi$i17$iZ2D = $$pre$i16$i;$F4$0$i$i = $843;
          } else {
           $849 = ((($843)) + 8|0);
           $850 = HEAP32[$849>>2]|0;
           $851 = HEAP32[(17388)>>2]|0;
           $852 = ($850>>>0)<($851>>>0);
           if (!($852)) {
            $$pre$phi$i17$iZ2D = $849;$F4$0$i$i = $850;
            break;
           }
           _abort();
           // unreachable;
          }
         } while(0);
         HEAP32[$$pre$phi$i17$iZ2D>>2] = $726;
         $853 = ((($F4$0$i$i)) + 12|0);
         HEAP32[$853>>2] = $726;
         $854 = ((($726)) + 8|0);
         HEAP32[$854>>2] = $F4$0$i$i;
         $855 = ((($726)) + 12|0);
         HEAP32[$855>>2] = $843;
         break;
        }
        $856 = $qsize$0$i$i >>> 8;
        $857 = ($856|0)==(0);
        do {
         if ($857) {
          $I7$0$i$i = 0;
         } else {
          $858 = ($qsize$0$i$i>>>0)>(16777215);
          if ($858) {
           $I7$0$i$i = 31;
           break;
          }
          $859 = (($856) + 1048320)|0;
          $860 = $859 >>> 16;
          $861 = $860 & 8;
          $862 = $856 << $861;
          $863 = (($862) + 520192)|0;
          $864 = $863 >>> 16;
          $865 = $864 & 4;
          $866 = $865 | $861;
          $867 = $862 << $865;
          $868 = (($867) + 245760)|0;
          $869 = $868 >>> 16;
          $870 = $869 & 2;
          $871 = $866 | $870;
          $872 = (14 - ($871))|0;
          $873 = $867 << $870;
          $874 = $873 >>> 15;
          $875 = (($872) + ($874))|0;
          $876 = $875 << 1;
          $877 = (($875) + 7)|0;
          $878 = $qsize$0$i$i >>> $877;
          $879 = $878 & 1;
          $880 = $879 | $876;
          $I7$0$i$i = $880;
         }
        } while(0);
        $881 = (17676 + ($I7$0$i$i<<2)|0);
        $882 = ((($726)) + 28|0);
        HEAP32[$882>>2] = $I7$0$i$i;
        $883 = ((($726)) + 16|0);
        $884 = ((($883)) + 4|0);
        HEAP32[$884>>2] = 0;
        HEAP32[$883>>2] = 0;
        $885 = HEAP32[(17376)>>2]|0;
        $886 = 1 << $I7$0$i$i;
        $887 = $885 & $886;
        $888 = ($887|0)==(0);
        if ($888) {
         $889 = $885 | $886;
         HEAP32[(17376)>>2] = $889;
         HEAP32[$881>>2] = $726;
         $890 = ((($726)) + 24|0);
         HEAP32[$890>>2] = $881;
         $891 = ((($726)) + 12|0);
         HEAP32[$891>>2] = $726;
         $892 = ((($726)) + 8|0);
         HEAP32[$892>>2] = $726;
         break;
        }
        $893 = HEAP32[$881>>2]|0;
        $894 = ($I7$0$i$i|0)==(31);
        $895 = $I7$0$i$i >>> 1;
        $896 = (25 - ($895))|0;
        $897 = $894 ? 0 : $896;
        $898 = $qsize$0$i$i << $897;
        $K8$0$i$i = $898;$T$0$i18$i = $893;
        while(1) {
         $899 = ((($T$0$i18$i)) + 4|0);
         $900 = HEAP32[$899>>2]|0;
         $901 = $900 & -8;
         $902 = ($901|0)==($qsize$0$i$i|0);
         if ($902) {
          label = 281;
          break;
         }
         $903 = $K8$0$i$i >>> 31;
         $904 = (((($T$0$i18$i)) + 16|0) + ($903<<2)|0);
         $905 = $K8$0$i$i << 1;
         $906 = HEAP32[$904>>2]|0;
         $907 = ($906|0)==(0|0);
         if ($907) {
          label = 278;
          break;
         } else {
          $K8$0$i$i = $905;$T$0$i18$i = $906;
         }
        }
        if ((label|0) == 278) {
         $908 = HEAP32[(17388)>>2]|0;
         $909 = ($904>>>0)<($908>>>0);
         if ($909) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$904>>2] = $726;
          $910 = ((($726)) + 24|0);
          HEAP32[$910>>2] = $T$0$i18$i;
          $911 = ((($726)) + 12|0);
          HEAP32[$911>>2] = $726;
          $912 = ((($726)) + 8|0);
          HEAP32[$912>>2] = $726;
          break;
         }
        }
        else if ((label|0) == 281) {
         $913 = ((($T$0$i18$i)) + 8|0);
         $914 = HEAP32[$913>>2]|0;
         $915 = HEAP32[(17388)>>2]|0;
         $916 = ($914>>>0)>=($915>>>0);
         $not$$i20$i = ($T$0$i18$i>>>0)>=($915>>>0);
         $917 = $916 & $not$$i20$i;
         if ($917) {
          $918 = ((($914)) + 12|0);
          HEAP32[$918>>2] = $726;
          HEAP32[$913>>2] = $726;
          $919 = ((($726)) + 8|0);
          HEAP32[$919>>2] = $914;
          $920 = ((($726)) + 12|0);
          HEAP32[$920>>2] = $T$0$i18$i;
          $921 = ((($726)) + 24|0);
          HEAP32[$921>>2] = 0;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       }
      } while(0);
      $1052 = ((($714)) + 8|0);
      $$0 = $1052;
      return ($$0|0);
     } else {
      $sp$0$i$i$i = (17820);
     }
    }
    while(1) {
     $922 = HEAP32[$sp$0$i$i$i>>2]|0;
     $923 = ($922>>>0)>($635>>>0);
     if (!($923)) {
      $924 = ((($sp$0$i$i$i)) + 4|0);
      $925 = HEAP32[$924>>2]|0;
      $926 = (($922) + ($925)|0);
      $927 = ($926>>>0)>($635>>>0);
      if ($927) {
       break;
      }
     }
     $928 = ((($sp$0$i$i$i)) + 8|0);
     $929 = HEAP32[$928>>2]|0;
     $sp$0$i$i$i = $929;
    }
    $930 = ((($926)) + -47|0);
    $931 = ((($930)) + 8|0);
    $932 = $931;
    $933 = $932 & 7;
    $934 = ($933|0)==(0);
    $935 = (0 - ($932))|0;
    $936 = $935 & 7;
    $937 = $934 ? 0 : $936;
    $938 = (($930) + ($937)|0);
    $939 = ((($635)) + 16|0);
    $940 = ($938>>>0)<($939>>>0);
    $941 = $940 ? $635 : $938;
    $942 = ((($941)) + 8|0);
    $943 = ((($941)) + 24|0);
    $944 = (($tsize$745$i) + -40)|0;
    $945 = ((($tbase$746$i)) + 8|0);
    $946 = $945;
    $947 = $946 & 7;
    $948 = ($947|0)==(0);
    $949 = (0 - ($946))|0;
    $950 = $949 & 7;
    $951 = $948 ? 0 : $950;
    $952 = (($tbase$746$i) + ($951)|0);
    $953 = (($944) - ($951))|0;
    HEAP32[(17396)>>2] = $952;
    HEAP32[(17384)>>2] = $953;
    $954 = $953 | 1;
    $955 = ((($952)) + 4|0);
    HEAP32[$955>>2] = $954;
    $956 = (($952) + ($953)|0);
    $957 = ((($956)) + 4|0);
    HEAP32[$957>>2] = 40;
    $958 = HEAP32[(17860)>>2]|0;
    HEAP32[(17400)>>2] = $958;
    $959 = ((($941)) + 4|0);
    HEAP32[$959>>2] = 27;
    ;HEAP32[$942>>2]=HEAP32[(17820)>>2]|0;HEAP32[$942+4>>2]=HEAP32[(17820)+4>>2]|0;HEAP32[$942+8>>2]=HEAP32[(17820)+8>>2]|0;HEAP32[$942+12>>2]=HEAP32[(17820)+12>>2]|0;
    HEAP32[(17820)>>2] = $tbase$746$i;
    HEAP32[(17824)>>2] = $tsize$745$i;
    HEAP32[(17832)>>2] = 0;
    HEAP32[(17828)>>2] = $942;
    $p$0$i$i = $943;
    while(1) {
     $960 = ((($p$0$i$i)) + 4|0);
     HEAP32[$960>>2] = 7;
     $961 = ((($960)) + 4|0);
     $962 = ($961>>>0)<($926>>>0);
     if ($962) {
      $p$0$i$i = $960;
     } else {
      break;
     }
    }
    $963 = ($941|0)==($635|0);
    if (!($963)) {
     $964 = $941;
     $965 = $635;
     $966 = (($964) - ($965))|0;
     $967 = HEAP32[$959>>2]|0;
     $968 = $967 & -2;
     HEAP32[$959>>2] = $968;
     $969 = $966 | 1;
     $970 = ((($635)) + 4|0);
     HEAP32[$970>>2] = $969;
     HEAP32[$941>>2] = $966;
     $971 = $966 >>> 3;
     $972 = ($966>>>0)<(256);
     if ($972) {
      $973 = $971 << 1;
      $974 = (17412 + ($973<<2)|0);
      $975 = HEAP32[4343]|0;
      $976 = 1 << $971;
      $977 = $975 & $976;
      $978 = ($977|0)==(0);
      if ($978) {
       $979 = $975 | $976;
       HEAP32[4343] = $979;
       $$pre$i$i = ((($974)) + 8|0);
       $$pre$phi$i$iZ2D = $$pre$i$i;$F$0$i$i = $974;
      } else {
       $980 = ((($974)) + 8|0);
       $981 = HEAP32[$980>>2]|0;
       $982 = HEAP32[(17388)>>2]|0;
       $983 = ($981>>>0)<($982>>>0);
       if ($983) {
        _abort();
        // unreachable;
       } else {
        $$pre$phi$i$iZ2D = $980;$F$0$i$i = $981;
       }
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $635;
      $984 = ((($F$0$i$i)) + 12|0);
      HEAP32[$984>>2] = $635;
      $985 = ((($635)) + 8|0);
      HEAP32[$985>>2] = $F$0$i$i;
      $986 = ((($635)) + 12|0);
      HEAP32[$986>>2] = $974;
      break;
     }
     $987 = $966 >>> 8;
     $988 = ($987|0)==(0);
     if ($988) {
      $I1$0$i$i = 0;
     } else {
      $989 = ($966>>>0)>(16777215);
      if ($989) {
       $I1$0$i$i = 31;
      } else {
       $990 = (($987) + 1048320)|0;
       $991 = $990 >>> 16;
       $992 = $991 & 8;
       $993 = $987 << $992;
       $994 = (($993) + 520192)|0;
       $995 = $994 >>> 16;
       $996 = $995 & 4;
       $997 = $996 | $992;
       $998 = $993 << $996;
       $999 = (($998) + 245760)|0;
       $1000 = $999 >>> 16;
       $1001 = $1000 & 2;
       $1002 = $997 | $1001;
       $1003 = (14 - ($1002))|0;
       $1004 = $998 << $1001;
       $1005 = $1004 >>> 15;
       $1006 = (($1003) + ($1005))|0;
       $1007 = $1006 << 1;
       $1008 = (($1006) + 7)|0;
       $1009 = $966 >>> $1008;
       $1010 = $1009 & 1;
       $1011 = $1010 | $1007;
       $I1$0$i$i = $1011;
      }
     }
     $1012 = (17676 + ($I1$0$i$i<<2)|0);
     $1013 = ((($635)) + 28|0);
     HEAP32[$1013>>2] = $I1$0$i$i;
     $1014 = ((($635)) + 20|0);
     HEAP32[$1014>>2] = 0;
     HEAP32[$939>>2] = 0;
     $1015 = HEAP32[(17376)>>2]|0;
     $1016 = 1 << $I1$0$i$i;
     $1017 = $1015 & $1016;
     $1018 = ($1017|0)==(0);
     if ($1018) {
      $1019 = $1015 | $1016;
      HEAP32[(17376)>>2] = $1019;
      HEAP32[$1012>>2] = $635;
      $1020 = ((($635)) + 24|0);
      HEAP32[$1020>>2] = $1012;
      $1021 = ((($635)) + 12|0);
      HEAP32[$1021>>2] = $635;
      $1022 = ((($635)) + 8|0);
      HEAP32[$1022>>2] = $635;
      break;
     }
     $1023 = HEAP32[$1012>>2]|0;
     $1024 = ($I1$0$i$i|0)==(31);
     $1025 = $I1$0$i$i >>> 1;
     $1026 = (25 - ($1025))|0;
     $1027 = $1024 ? 0 : $1026;
     $1028 = $966 << $1027;
     $K2$0$i$i = $1028;$T$0$i$i = $1023;
     while(1) {
      $1029 = ((($T$0$i$i)) + 4|0);
      $1030 = HEAP32[$1029>>2]|0;
      $1031 = $1030 & -8;
      $1032 = ($1031|0)==($966|0);
      if ($1032) {
       label = 307;
       break;
      }
      $1033 = $K2$0$i$i >>> 31;
      $1034 = (((($T$0$i$i)) + 16|0) + ($1033<<2)|0);
      $1035 = $K2$0$i$i << 1;
      $1036 = HEAP32[$1034>>2]|0;
      $1037 = ($1036|0)==(0|0);
      if ($1037) {
       label = 304;
       break;
      } else {
       $K2$0$i$i = $1035;$T$0$i$i = $1036;
      }
     }
     if ((label|0) == 304) {
      $1038 = HEAP32[(17388)>>2]|0;
      $1039 = ($1034>>>0)<($1038>>>0);
      if ($1039) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$1034>>2] = $635;
       $1040 = ((($635)) + 24|0);
       HEAP32[$1040>>2] = $T$0$i$i;
       $1041 = ((($635)) + 12|0);
       HEAP32[$1041>>2] = $635;
       $1042 = ((($635)) + 8|0);
       HEAP32[$1042>>2] = $635;
       break;
      }
     }
     else if ((label|0) == 307) {
      $1043 = ((($T$0$i$i)) + 8|0);
      $1044 = HEAP32[$1043>>2]|0;
      $1045 = HEAP32[(17388)>>2]|0;
      $1046 = ($1044>>>0)>=($1045>>>0);
      $not$$i$i = ($T$0$i$i>>>0)>=($1045>>>0);
      $1047 = $1046 & $not$$i$i;
      if ($1047) {
       $1048 = ((($1044)) + 12|0);
       HEAP32[$1048>>2] = $635;
       HEAP32[$1043>>2] = $635;
       $1049 = ((($635)) + 8|0);
       HEAP32[$1049>>2] = $1044;
       $1050 = ((($635)) + 12|0);
       HEAP32[$1050>>2] = $T$0$i$i;
       $1051 = ((($635)) + 24|0);
       HEAP32[$1051>>2] = 0;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    }
   }
  } while(0);
  $1053 = HEAP32[(17384)>>2]|0;
  $1054 = ($1053>>>0)>($nb$0>>>0);
  if ($1054) {
   $1055 = (($1053) - ($nb$0))|0;
   HEAP32[(17384)>>2] = $1055;
   $1056 = HEAP32[(17396)>>2]|0;
   $1057 = (($1056) + ($nb$0)|0);
   HEAP32[(17396)>>2] = $1057;
   $1058 = $1055 | 1;
   $1059 = ((($1057)) + 4|0);
   HEAP32[$1059>>2] = $1058;
   $1060 = $nb$0 | 3;
   $1061 = ((($1056)) + 4|0);
   HEAP32[$1061>>2] = $1060;
   $1062 = ((($1056)) + 8|0);
   $$0 = $1062;
   return ($$0|0);
  }
 }
 $1063 = HEAP32[4331]|0;
 $1064 = ($1063|0)==(0|0);
 if ($1064) {
  $$0$i = 17368;
 } else {
  $1065 = (_pthread_self()|0);
  $1066 = ((($1065)) + 64|0);
  $1067 = HEAP32[$1066>>2]|0;
  $$0$i = $1067;
 }
 HEAP32[$$0$i>>2] = 12;
 $$0 = 0;
 return ($$0|0);
}
function _free($mem) {
 $mem = $mem|0;
 var $$pre = 0, $$pre$phi41Z2D = 0, $$pre$phi43Z2D = 0, $$pre$phiZ2D = 0, $$pre40 = 0, $$pre42 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0;
 var $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0;
 var $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0;
 var $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0;
 var $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0;
 var $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0;
 var $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0;
 var $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0;
 var $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0;
 var $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0;
 var $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0;
 var $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0;
 var $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0;
 var $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0;
 var $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0;
 var $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0;
 var $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $F18$0 = 0, $I20$0 = 0, $K21$0 = 0, $R$1 = 0, $R$3 = 0, $R8$1 = 0, $R8$3 = 0, $RP$1 = 0, $RP10$1 = 0, $T$0 = 0, $cond20 = 0, $cond21 = 0, $not$ = 0, $p$1 = 0;
 var $psize$1 = 0, $psize$2 = 0, $sp$0$i = 0, $sp$0$in$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($mem|0)==(0|0);
 if ($0) {
  return;
 }
 $1 = ((($mem)) + -8|0);
 $2 = HEAP32[(17388)>>2]|0;
 $3 = ($1>>>0)<($2>>>0);
 if ($3) {
  _abort();
  // unreachable;
 }
 $4 = ((($mem)) + -4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $5 & 3;
 $7 = ($6|0)==(1);
 if ($7) {
  _abort();
  // unreachable;
 }
 $8 = $5 & -8;
 $9 = (($1) + ($8)|0);
 $10 = $5 & 1;
 $11 = ($10|0)==(0);
 do {
  if ($11) {
   $12 = HEAP32[$1>>2]|0;
   $13 = ($6|0)==(0);
   if ($13) {
    return;
   }
   $14 = (0 - ($12))|0;
   $15 = (($1) + ($14)|0);
   $16 = (($12) + ($8))|0;
   $17 = ($15>>>0)<($2>>>0);
   if ($17) {
    _abort();
    // unreachable;
   }
   $18 = HEAP32[(17392)>>2]|0;
   $19 = ($15|0)==($18|0);
   if ($19) {
    $104 = ((($9)) + 4|0);
    $105 = HEAP32[$104>>2]|0;
    $106 = $105 & 3;
    $107 = ($106|0)==(3);
    if (!($107)) {
     $p$1 = $15;$psize$1 = $16;
     break;
    }
    HEAP32[(17380)>>2] = $16;
    $108 = $105 & -2;
    HEAP32[$104>>2] = $108;
    $109 = $16 | 1;
    $110 = ((($15)) + 4|0);
    HEAP32[$110>>2] = $109;
    $111 = (($15) + ($16)|0);
    HEAP32[$111>>2] = $16;
    return;
   }
   $20 = $12 >>> 3;
   $21 = ($12>>>0)<(256);
   if ($21) {
    $22 = ((($15)) + 8|0);
    $23 = HEAP32[$22>>2]|0;
    $24 = ((($15)) + 12|0);
    $25 = HEAP32[$24>>2]|0;
    $26 = $20 << 1;
    $27 = (17412 + ($26<<2)|0);
    $28 = ($23|0)==($27|0);
    if (!($28)) {
     $29 = ($23>>>0)<($2>>>0);
     if ($29) {
      _abort();
      // unreachable;
     }
     $30 = ((($23)) + 12|0);
     $31 = HEAP32[$30>>2]|0;
     $32 = ($31|0)==($15|0);
     if (!($32)) {
      _abort();
      // unreachable;
     }
    }
    $33 = ($25|0)==($23|0);
    if ($33) {
     $34 = 1 << $20;
     $35 = $34 ^ -1;
     $36 = HEAP32[4343]|0;
     $37 = $36 & $35;
     HEAP32[4343] = $37;
     $p$1 = $15;$psize$1 = $16;
     break;
    }
    $38 = ($25|0)==($27|0);
    if ($38) {
     $$pre42 = ((($25)) + 8|0);
     $$pre$phi43Z2D = $$pre42;
    } else {
     $39 = ($25>>>0)<($2>>>0);
     if ($39) {
      _abort();
      // unreachable;
     }
     $40 = ((($25)) + 8|0);
     $41 = HEAP32[$40>>2]|0;
     $42 = ($41|0)==($15|0);
     if ($42) {
      $$pre$phi43Z2D = $40;
     } else {
      _abort();
      // unreachable;
     }
    }
    $43 = ((($23)) + 12|0);
    HEAP32[$43>>2] = $25;
    HEAP32[$$pre$phi43Z2D>>2] = $23;
    $p$1 = $15;$psize$1 = $16;
    break;
   }
   $44 = ((($15)) + 24|0);
   $45 = HEAP32[$44>>2]|0;
   $46 = ((($15)) + 12|0);
   $47 = HEAP32[$46>>2]|0;
   $48 = ($47|0)==($15|0);
   do {
    if ($48) {
     $58 = ((($15)) + 16|0);
     $59 = ((($58)) + 4|0);
     $60 = HEAP32[$59>>2]|0;
     $61 = ($60|0)==(0|0);
     if ($61) {
      $62 = HEAP32[$58>>2]|0;
      $63 = ($62|0)==(0|0);
      if ($63) {
       $R$3 = 0;
       break;
      } else {
       $R$1 = $62;$RP$1 = $58;
      }
     } else {
      $R$1 = $60;$RP$1 = $59;
     }
     while(1) {
      $64 = ((($R$1)) + 20|0);
      $65 = HEAP32[$64>>2]|0;
      $66 = ($65|0)==(0|0);
      if (!($66)) {
       $R$1 = $65;$RP$1 = $64;
       continue;
      }
      $67 = ((($R$1)) + 16|0);
      $68 = HEAP32[$67>>2]|0;
      $69 = ($68|0)==(0|0);
      if ($69) {
       break;
      } else {
       $R$1 = $68;$RP$1 = $67;
      }
     }
     $70 = ($RP$1>>>0)<($2>>>0);
     if ($70) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$RP$1>>2] = 0;
      $R$3 = $R$1;
      break;
     }
    } else {
     $49 = ((($15)) + 8|0);
     $50 = HEAP32[$49>>2]|0;
     $51 = ($50>>>0)<($2>>>0);
     if ($51) {
      _abort();
      // unreachable;
     }
     $52 = ((($50)) + 12|0);
     $53 = HEAP32[$52>>2]|0;
     $54 = ($53|0)==($15|0);
     if (!($54)) {
      _abort();
      // unreachable;
     }
     $55 = ((($47)) + 8|0);
     $56 = HEAP32[$55>>2]|0;
     $57 = ($56|0)==($15|0);
     if ($57) {
      HEAP32[$52>>2] = $47;
      HEAP32[$55>>2] = $50;
      $R$3 = $47;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $71 = ($45|0)==(0|0);
   if ($71) {
    $p$1 = $15;$psize$1 = $16;
   } else {
    $72 = ((($15)) + 28|0);
    $73 = HEAP32[$72>>2]|0;
    $74 = (17676 + ($73<<2)|0);
    $75 = HEAP32[$74>>2]|0;
    $76 = ($15|0)==($75|0);
    if ($76) {
     HEAP32[$74>>2] = $R$3;
     $cond20 = ($R$3|0)==(0|0);
     if ($cond20) {
      $77 = 1 << $73;
      $78 = $77 ^ -1;
      $79 = HEAP32[(17376)>>2]|0;
      $80 = $79 & $78;
      HEAP32[(17376)>>2] = $80;
      $p$1 = $15;$psize$1 = $16;
      break;
     }
    } else {
     $81 = HEAP32[(17388)>>2]|0;
     $82 = ($45>>>0)<($81>>>0);
     if ($82) {
      _abort();
      // unreachable;
     }
     $83 = ((($45)) + 16|0);
     $84 = HEAP32[$83>>2]|0;
     $85 = ($84|0)==($15|0);
     if ($85) {
      HEAP32[$83>>2] = $R$3;
     } else {
      $86 = ((($45)) + 20|0);
      HEAP32[$86>>2] = $R$3;
     }
     $87 = ($R$3|0)==(0|0);
     if ($87) {
      $p$1 = $15;$psize$1 = $16;
      break;
     }
    }
    $88 = HEAP32[(17388)>>2]|0;
    $89 = ($R$3>>>0)<($88>>>0);
    if ($89) {
     _abort();
     // unreachable;
    }
    $90 = ((($R$3)) + 24|0);
    HEAP32[$90>>2] = $45;
    $91 = ((($15)) + 16|0);
    $92 = HEAP32[$91>>2]|0;
    $93 = ($92|0)==(0|0);
    do {
     if (!($93)) {
      $94 = ($92>>>0)<($88>>>0);
      if ($94) {
       _abort();
       // unreachable;
      } else {
       $95 = ((($R$3)) + 16|0);
       HEAP32[$95>>2] = $92;
       $96 = ((($92)) + 24|0);
       HEAP32[$96>>2] = $R$3;
       break;
      }
     }
    } while(0);
    $97 = ((($91)) + 4|0);
    $98 = HEAP32[$97>>2]|0;
    $99 = ($98|0)==(0|0);
    if ($99) {
     $p$1 = $15;$psize$1 = $16;
    } else {
     $100 = HEAP32[(17388)>>2]|0;
     $101 = ($98>>>0)<($100>>>0);
     if ($101) {
      _abort();
      // unreachable;
     } else {
      $102 = ((($R$3)) + 20|0);
      HEAP32[$102>>2] = $98;
      $103 = ((($98)) + 24|0);
      HEAP32[$103>>2] = $R$3;
      $p$1 = $15;$psize$1 = $16;
      break;
     }
    }
   }
  } else {
   $p$1 = $1;$psize$1 = $8;
  }
 } while(0);
 $112 = ($p$1>>>0)<($9>>>0);
 if (!($112)) {
  _abort();
  // unreachable;
 }
 $113 = ((($9)) + 4|0);
 $114 = HEAP32[$113>>2]|0;
 $115 = $114 & 1;
 $116 = ($115|0)==(0);
 if ($116) {
  _abort();
  // unreachable;
 }
 $117 = $114 & 2;
 $118 = ($117|0)==(0);
 if ($118) {
  $119 = HEAP32[(17396)>>2]|0;
  $120 = ($9|0)==($119|0);
  if ($120) {
   $121 = HEAP32[(17384)>>2]|0;
   $122 = (($121) + ($psize$1))|0;
   HEAP32[(17384)>>2] = $122;
   HEAP32[(17396)>>2] = $p$1;
   $123 = $122 | 1;
   $124 = ((($p$1)) + 4|0);
   HEAP32[$124>>2] = $123;
   $125 = HEAP32[(17392)>>2]|0;
   $126 = ($p$1|0)==($125|0);
   if (!($126)) {
    return;
   }
   HEAP32[(17392)>>2] = 0;
   HEAP32[(17380)>>2] = 0;
   return;
  }
  $127 = HEAP32[(17392)>>2]|0;
  $128 = ($9|0)==($127|0);
  if ($128) {
   $129 = HEAP32[(17380)>>2]|0;
   $130 = (($129) + ($psize$1))|0;
   HEAP32[(17380)>>2] = $130;
   HEAP32[(17392)>>2] = $p$1;
   $131 = $130 | 1;
   $132 = ((($p$1)) + 4|0);
   HEAP32[$132>>2] = $131;
   $133 = (($p$1) + ($130)|0);
   HEAP32[$133>>2] = $130;
   return;
  }
  $134 = $114 & -8;
  $135 = (($134) + ($psize$1))|0;
  $136 = $114 >>> 3;
  $137 = ($114>>>0)<(256);
  do {
   if ($137) {
    $138 = ((($9)) + 8|0);
    $139 = HEAP32[$138>>2]|0;
    $140 = ((($9)) + 12|0);
    $141 = HEAP32[$140>>2]|0;
    $142 = $136 << 1;
    $143 = (17412 + ($142<<2)|0);
    $144 = ($139|0)==($143|0);
    if (!($144)) {
     $145 = HEAP32[(17388)>>2]|0;
     $146 = ($139>>>0)<($145>>>0);
     if ($146) {
      _abort();
      // unreachable;
     }
     $147 = ((($139)) + 12|0);
     $148 = HEAP32[$147>>2]|0;
     $149 = ($148|0)==($9|0);
     if (!($149)) {
      _abort();
      // unreachable;
     }
    }
    $150 = ($141|0)==($139|0);
    if ($150) {
     $151 = 1 << $136;
     $152 = $151 ^ -1;
     $153 = HEAP32[4343]|0;
     $154 = $153 & $152;
     HEAP32[4343] = $154;
     break;
    }
    $155 = ($141|0)==($143|0);
    if ($155) {
     $$pre40 = ((($141)) + 8|0);
     $$pre$phi41Z2D = $$pre40;
    } else {
     $156 = HEAP32[(17388)>>2]|0;
     $157 = ($141>>>0)<($156>>>0);
     if ($157) {
      _abort();
      // unreachable;
     }
     $158 = ((($141)) + 8|0);
     $159 = HEAP32[$158>>2]|0;
     $160 = ($159|0)==($9|0);
     if ($160) {
      $$pre$phi41Z2D = $158;
     } else {
      _abort();
      // unreachable;
     }
    }
    $161 = ((($139)) + 12|0);
    HEAP32[$161>>2] = $141;
    HEAP32[$$pre$phi41Z2D>>2] = $139;
   } else {
    $162 = ((($9)) + 24|0);
    $163 = HEAP32[$162>>2]|0;
    $164 = ((($9)) + 12|0);
    $165 = HEAP32[$164>>2]|0;
    $166 = ($165|0)==($9|0);
    do {
     if ($166) {
      $177 = ((($9)) + 16|0);
      $178 = ((($177)) + 4|0);
      $179 = HEAP32[$178>>2]|0;
      $180 = ($179|0)==(0|0);
      if ($180) {
       $181 = HEAP32[$177>>2]|0;
       $182 = ($181|0)==(0|0);
       if ($182) {
        $R8$3 = 0;
        break;
       } else {
        $R8$1 = $181;$RP10$1 = $177;
       }
      } else {
       $R8$1 = $179;$RP10$1 = $178;
      }
      while(1) {
       $183 = ((($R8$1)) + 20|0);
       $184 = HEAP32[$183>>2]|0;
       $185 = ($184|0)==(0|0);
       if (!($185)) {
        $R8$1 = $184;$RP10$1 = $183;
        continue;
       }
       $186 = ((($R8$1)) + 16|0);
       $187 = HEAP32[$186>>2]|0;
       $188 = ($187|0)==(0|0);
       if ($188) {
        break;
       } else {
        $R8$1 = $187;$RP10$1 = $186;
       }
      }
      $189 = HEAP32[(17388)>>2]|0;
      $190 = ($RP10$1>>>0)<($189>>>0);
      if ($190) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$RP10$1>>2] = 0;
       $R8$3 = $R8$1;
       break;
      }
     } else {
      $167 = ((($9)) + 8|0);
      $168 = HEAP32[$167>>2]|0;
      $169 = HEAP32[(17388)>>2]|0;
      $170 = ($168>>>0)<($169>>>0);
      if ($170) {
       _abort();
       // unreachable;
      }
      $171 = ((($168)) + 12|0);
      $172 = HEAP32[$171>>2]|0;
      $173 = ($172|0)==($9|0);
      if (!($173)) {
       _abort();
       // unreachable;
      }
      $174 = ((($165)) + 8|0);
      $175 = HEAP32[$174>>2]|0;
      $176 = ($175|0)==($9|0);
      if ($176) {
       HEAP32[$171>>2] = $165;
       HEAP32[$174>>2] = $168;
       $R8$3 = $165;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $191 = ($163|0)==(0|0);
    if (!($191)) {
     $192 = ((($9)) + 28|0);
     $193 = HEAP32[$192>>2]|0;
     $194 = (17676 + ($193<<2)|0);
     $195 = HEAP32[$194>>2]|0;
     $196 = ($9|0)==($195|0);
     if ($196) {
      HEAP32[$194>>2] = $R8$3;
      $cond21 = ($R8$3|0)==(0|0);
      if ($cond21) {
       $197 = 1 << $193;
       $198 = $197 ^ -1;
       $199 = HEAP32[(17376)>>2]|0;
       $200 = $199 & $198;
       HEAP32[(17376)>>2] = $200;
       break;
      }
     } else {
      $201 = HEAP32[(17388)>>2]|0;
      $202 = ($163>>>0)<($201>>>0);
      if ($202) {
       _abort();
       // unreachable;
      }
      $203 = ((($163)) + 16|0);
      $204 = HEAP32[$203>>2]|0;
      $205 = ($204|0)==($9|0);
      if ($205) {
       HEAP32[$203>>2] = $R8$3;
      } else {
       $206 = ((($163)) + 20|0);
       HEAP32[$206>>2] = $R8$3;
      }
      $207 = ($R8$3|0)==(0|0);
      if ($207) {
       break;
      }
     }
     $208 = HEAP32[(17388)>>2]|0;
     $209 = ($R8$3>>>0)<($208>>>0);
     if ($209) {
      _abort();
      // unreachable;
     }
     $210 = ((($R8$3)) + 24|0);
     HEAP32[$210>>2] = $163;
     $211 = ((($9)) + 16|0);
     $212 = HEAP32[$211>>2]|0;
     $213 = ($212|0)==(0|0);
     do {
      if (!($213)) {
       $214 = ($212>>>0)<($208>>>0);
       if ($214) {
        _abort();
        // unreachable;
       } else {
        $215 = ((($R8$3)) + 16|0);
        HEAP32[$215>>2] = $212;
        $216 = ((($212)) + 24|0);
        HEAP32[$216>>2] = $R8$3;
        break;
       }
      }
     } while(0);
     $217 = ((($211)) + 4|0);
     $218 = HEAP32[$217>>2]|0;
     $219 = ($218|0)==(0|0);
     if (!($219)) {
      $220 = HEAP32[(17388)>>2]|0;
      $221 = ($218>>>0)<($220>>>0);
      if ($221) {
       _abort();
       // unreachable;
      } else {
       $222 = ((($R8$3)) + 20|0);
       HEAP32[$222>>2] = $218;
       $223 = ((($218)) + 24|0);
       HEAP32[$223>>2] = $R8$3;
       break;
      }
     }
    }
   }
  } while(0);
  $224 = $135 | 1;
  $225 = ((($p$1)) + 4|0);
  HEAP32[$225>>2] = $224;
  $226 = (($p$1) + ($135)|0);
  HEAP32[$226>>2] = $135;
  $227 = HEAP32[(17392)>>2]|0;
  $228 = ($p$1|0)==($227|0);
  if ($228) {
   HEAP32[(17380)>>2] = $135;
   return;
  } else {
   $psize$2 = $135;
  }
 } else {
  $229 = $114 & -2;
  HEAP32[$113>>2] = $229;
  $230 = $psize$1 | 1;
  $231 = ((($p$1)) + 4|0);
  HEAP32[$231>>2] = $230;
  $232 = (($p$1) + ($psize$1)|0);
  HEAP32[$232>>2] = $psize$1;
  $psize$2 = $psize$1;
 }
 $233 = $psize$2 >>> 3;
 $234 = ($psize$2>>>0)<(256);
 if ($234) {
  $235 = $233 << 1;
  $236 = (17412 + ($235<<2)|0);
  $237 = HEAP32[4343]|0;
  $238 = 1 << $233;
  $239 = $237 & $238;
  $240 = ($239|0)==(0);
  if ($240) {
   $241 = $237 | $238;
   HEAP32[4343] = $241;
   $$pre = ((($236)) + 8|0);
   $$pre$phiZ2D = $$pre;$F18$0 = $236;
  } else {
   $242 = ((($236)) + 8|0);
   $243 = HEAP32[$242>>2]|0;
   $244 = HEAP32[(17388)>>2]|0;
   $245 = ($243>>>0)<($244>>>0);
   if ($245) {
    _abort();
    // unreachable;
   } else {
    $$pre$phiZ2D = $242;$F18$0 = $243;
   }
  }
  HEAP32[$$pre$phiZ2D>>2] = $p$1;
  $246 = ((($F18$0)) + 12|0);
  HEAP32[$246>>2] = $p$1;
  $247 = ((($p$1)) + 8|0);
  HEAP32[$247>>2] = $F18$0;
  $248 = ((($p$1)) + 12|0);
  HEAP32[$248>>2] = $236;
  return;
 }
 $249 = $psize$2 >>> 8;
 $250 = ($249|0)==(0);
 if ($250) {
  $I20$0 = 0;
 } else {
  $251 = ($psize$2>>>0)>(16777215);
  if ($251) {
   $I20$0 = 31;
  } else {
   $252 = (($249) + 1048320)|0;
   $253 = $252 >>> 16;
   $254 = $253 & 8;
   $255 = $249 << $254;
   $256 = (($255) + 520192)|0;
   $257 = $256 >>> 16;
   $258 = $257 & 4;
   $259 = $258 | $254;
   $260 = $255 << $258;
   $261 = (($260) + 245760)|0;
   $262 = $261 >>> 16;
   $263 = $262 & 2;
   $264 = $259 | $263;
   $265 = (14 - ($264))|0;
   $266 = $260 << $263;
   $267 = $266 >>> 15;
   $268 = (($265) + ($267))|0;
   $269 = $268 << 1;
   $270 = (($268) + 7)|0;
   $271 = $psize$2 >>> $270;
   $272 = $271 & 1;
   $273 = $272 | $269;
   $I20$0 = $273;
  }
 }
 $274 = (17676 + ($I20$0<<2)|0);
 $275 = ((($p$1)) + 28|0);
 HEAP32[$275>>2] = $I20$0;
 $276 = ((($p$1)) + 16|0);
 $277 = ((($p$1)) + 20|0);
 HEAP32[$277>>2] = 0;
 HEAP32[$276>>2] = 0;
 $278 = HEAP32[(17376)>>2]|0;
 $279 = 1 << $I20$0;
 $280 = $278 & $279;
 $281 = ($280|0)==(0);
 do {
  if ($281) {
   $282 = $278 | $279;
   HEAP32[(17376)>>2] = $282;
   HEAP32[$274>>2] = $p$1;
   $283 = ((($p$1)) + 24|0);
   HEAP32[$283>>2] = $274;
   $284 = ((($p$1)) + 12|0);
   HEAP32[$284>>2] = $p$1;
   $285 = ((($p$1)) + 8|0);
   HEAP32[$285>>2] = $p$1;
  } else {
   $286 = HEAP32[$274>>2]|0;
   $287 = ($I20$0|0)==(31);
   $288 = $I20$0 >>> 1;
   $289 = (25 - ($288))|0;
   $290 = $287 ? 0 : $289;
   $291 = $psize$2 << $290;
   $K21$0 = $291;$T$0 = $286;
   while(1) {
    $292 = ((($T$0)) + 4|0);
    $293 = HEAP32[$292>>2]|0;
    $294 = $293 & -8;
    $295 = ($294|0)==($psize$2|0);
    if ($295) {
     label = 130;
     break;
    }
    $296 = $K21$0 >>> 31;
    $297 = (((($T$0)) + 16|0) + ($296<<2)|0);
    $298 = $K21$0 << 1;
    $299 = HEAP32[$297>>2]|0;
    $300 = ($299|0)==(0|0);
    if ($300) {
     label = 127;
     break;
    } else {
     $K21$0 = $298;$T$0 = $299;
    }
   }
   if ((label|0) == 127) {
    $301 = HEAP32[(17388)>>2]|0;
    $302 = ($297>>>0)<($301>>>0);
    if ($302) {
     _abort();
     // unreachable;
    } else {
     HEAP32[$297>>2] = $p$1;
     $303 = ((($p$1)) + 24|0);
     HEAP32[$303>>2] = $T$0;
     $304 = ((($p$1)) + 12|0);
     HEAP32[$304>>2] = $p$1;
     $305 = ((($p$1)) + 8|0);
     HEAP32[$305>>2] = $p$1;
     break;
    }
   }
   else if ((label|0) == 130) {
    $306 = ((($T$0)) + 8|0);
    $307 = HEAP32[$306>>2]|0;
    $308 = HEAP32[(17388)>>2]|0;
    $309 = ($307>>>0)>=($308>>>0);
    $not$ = ($T$0>>>0)>=($308>>>0);
    $310 = $309 & $not$;
    if ($310) {
     $311 = ((($307)) + 12|0);
     HEAP32[$311>>2] = $p$1;
     HEAP32[$306>>2] = $p$1;
     $312 = ((($p$1)) + 8|0);
     HEAP32[$312>>2] = $307;
     $313 = ((($p$1)) + 12|0);
     HEAP32[$313>>2] = $T$0;
     $314 = ((($p$1)) + 24|0);
     HEAP32[$314>>2] = 0;
     break;
    } else {
     _abort();
     // unreachable;
    }
   }
  }
 } while(0);
 $315 = HEAP32[(17404)>>2]|0;
 $316 = (($315) + -1)|0;
 HEAP32[(17404)>>2] = $316;
 $317 = ($316|0)==(0);
 if ($317) {
  $sp$0$in$i = (17828);
 } else {
  return;
 }
 while(1) {
  $sp$0$i = HEAP32[$sp$0$in$i>>2]|0;
  $318 = ($sp$0$i|0)==(0|0);
  $319 = ((($sp$0$i)) + 8|0);
  if ($318) {
   break;
  } else {
   $sp$0$in$i = $319;
  }
 }
 HEAP32[(17404)>>2] = -1;
 return;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _free($this);
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($this,$thrown_type,$adjustedPtr) {
 $this = $this|0;
 $thrown_type = $thrown_type|0;
 $adjustedPtr = $adjustedPtr|0;
 var $$0 = 0, $$2 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $info = 0, dest = 0;
 var label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $info = sp;
 $0 = ($this|0)==($thrown_type|0);
 if ($0) {
  $$2 = 1;
 } else {
  $1 = ($thrown_type|0)==(0|0);
  if ($1) {
   $$2 = 0;
  } else {
   $2 = (___dynamic_cast($thrown_type,16)|0);
   $3 = ($2|0)==(0|0);
   if ($3) {
    $$2 = 0;
   } else {
    dest=$info; stop=dest+56|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
    HEAP32[$info>>2] = $2;
    $4 = ((($info)) + 8|0);
    HEAP32[$4>>2] = $this;
    $5 = ((($info)) + 12|0);
    HEAP32[$5>>2] = -1;
    $6 = ((($info)) + 48|0);
    HEAP32[$6>>2] = 1;
    $7 = HEAP32[$2>>2]|0;
    $8 = ((($7)) + 28|0);
    $9 = HEAP32[$8>>2]|0;
    $10 = HEAP32[$adjustedPtr>>2]|0;
    FUNCTION_TABLE_viiii[$9 & 31]($2,$info,$10,1);
    $11 = ((($info)) + 24|0);
    $12 = HEAP32[$11>>2]|0;
    $13 = ($12|0)==(1);
    if ($13) {
     $14 = ((($info)) + 16|0);
     $15 = HEAP32[$14>>2]|0;
     HEAP32[$adjustedPtr>>2] = $15;
     $$0 = 1;
    } else {
     $$0 = 0;
    }
    $$2 = $$0;
   }
  }
 }
 STACKTOP = sp;return ($$2|0);
}
function ___dynamic_cast($static_ptr,$dst_type) {
 $static_ptr = $static_ptr|0;
 $dst_type = $dst_type|0;
 var $$ = 0, $$8 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $dst_ptr$0 = 0, $info = 0, $or$cond = 0, $or$cond3 = 0, $or$cond5 = 0, $or$cond7 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $info = sp;
 $0 = HEAP32[$static_ptr>>2]|0;
 $1 = ((($0)) + -8|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = (($static_ptr) + ($2)|0);
 $4 = ((($0)) + -4|0);
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$info>>2] = $dst_type;
 $6 = ((($info)) + 4|0);
 HEAP32[$6>>2] = $static_ptr;
 $7 = ((($info)) + 8|0);
 HEAP32[$7>>2] = 48;
 $8 = ((($info)) + 12|0);
 $9 = ((($info)) + 16|0);
 $10 = ((($info)) + 20|0);
 $11 = ((($info)) + 24|0);
 $12 = ((($info)) + 28|0);
 $13 = ((($info)) + 32|0);
 $14 = ((($info)) + 40|0);
 $15 = ($5|0)==($dst_type|0);
 dest=$8; stop=dest+40|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));HEAP16[$8+40>>1]=0|0;HEAP8[$8+42>>0]=0|0;
 L1: do {
  if ($15) {
   $16 = ((($info)) + 48|0);
   HEAP32[$16>>2] = 1;
   $17 = HEAP32[$dst_type>>2]|0;
   $18 = ((($17)) + 20|0);
   $19 = HEAP32[$18>>2]|0;
   FUNCTION_TABLE_viiiiii[$19 & 31]($dst_type,$info,$3,$3,1,0);
   $20 = HEAP32[$11>>2]|0;
   $21 = ($20|0)==(1);
   $$ = $21 ? $3 : 0;
   $dst_ptr$0 = $$;
  } else {
   $22 = ((($info)) + 36|0);
   $23 = HEAP32[$5>>2]|0;
   $24 = ((($23)) + 24|0);
   $25 = HEAP32[$24>>2]|0;
   FUNCTION_TABLE_viiiii[$25 & 31]($5,$info,$3,1,0);
   $26 = HEAP32[$22>>2]|0;
   switch ($26|0) {
   case 0:  {
    $27 = HEAP32[$14>>2]|0;
    $28 = ($27|0)==(1);
    $29 = HEAP32[$12>>2]|0;
    $30 = ($29|0)==(1);
    $or$cond = $28 & $30;
    $31 = HEAP32[$13>>2]|0;
    $32 = ($31|0)==(1);
    $or$cond3 = $or$cond & $32;
    $33 = HEAP32[$10>>2]|0;
    $$8 = $or$cond3 ? $33 : 0;
    $dst_ptr$0 = $$8;
    break L1;
    break;
   }
   case 1:  {
    break;
   }
   default: {
    $dst_ptr$0 = 0;
    break L1;
   }
   }
   $34 = HEAP32[$11>>2]|0;
   $35 = ($34|0)==(1);
   if (!($35)) {
    $36 = HEAP32[$14>>2]|0;
    $37 = ($36|0)==(0);
    $38 = HEAP32[$12>>2]|0;
    $39 = ($38|0)==(1);
    $or$cond5 = $37 & $39;
    $40 = HEAP32[$13>>2]|0;
    $41 = ($40|0)==(1);
    $or$cond7 = $or$cond5 & $41;
    if (!($or$cond7)) {
     $dst_ptr$0 = 0;
     break;
    }
   }
   $42 = HEAP32[$9>>2]|0;
   $dst_ptr$0 = $42;
  }
 } while(0);
 STACKTOP = sp;return ($dst_ptr$0|0);
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($this,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $dst_ptr = $dst_ptr|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($info)) + 8|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($this|0)==($1|0);
 if ($2) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($info,$dst_ptr,$current_ptr,$path_below);
 } else {
  $3 = ((($this)) + 8|0);
  $4 = HEAP32[$3>>2]|0;
  $5 = HEAP32[$4>>2]|0;
  $6 = ((($5)) + 20|0);
  $7 = HEAP32[$6>>2]|0;
  FUNCTION_TABLE_viiiiii[$7 & 31]($4,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp);
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($info,$dst_ptr,$current_ptr,$path_below) {
 $info = $info|0;
 $dst_ptr = $dst_ptr|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($info)) + 53|0);
 HEAP8[$0>>0] = 1;
 $1 = ((($info)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ($2|0)==($current_ptr|0);
 do {
  if ($3) {
   $4 = ((($info)) + 52|0);
   HEAP8[$4>>0] = 1;
   $5 = ((($info)) + 16|0);
   $6 = HEAP32[$5>>2]|0;
   $7 = ($6|0)==(0|0);
   if ($7) {
    HEAP32[$5>>2] = $dst_ptr;
    $8 = ((($info)) + 24|0);
    HEAP32[$8>>2] = $path_below;
    $9 = ((($info)) + 36|0);
    HEAP32[$9>>2] = 1;
    $10 = ((($info)) + 48|0);
    $11 = HEAP32[$10>>2]|0;
    $12 = ($11|0)==(1);
    $13 = ($path_below|0)==(1);
    $or$cond = $12 & $13;
    if (!($or$cond)) {
     break;
    }
    $14 = ((($info)) + 54|0);
    HEAP8[$14>>0] = 1;
    break;
   }
   $15 = ($6|0)==($dst_ptr|0);
   if (!($15)) {
    $25 = ((($info)) + 36|0);
    $26 = HEAP32[$25>>2]|0;
    $27 = (($26) + 1)|0;
    HEAP32[$25>>2] = $27;
    $28 = ((($info)) + 54|0);
    HEAP8[$28>>0] = 1;
    break;
   }
   $16 = ((($info)) + 24|0);
   $17 = HEAP32[$16>>2]|0;
   $18 = ($17|0)==(2);
   if ($18) {
    HEAP32[$16>>2] = $path_below;
    $23 = $path_below;
   } else {
    $23 = $17;
   }
   $19 = ((($info)) + 48|0);
   $20 = HEAP32[$19>>2]|0;
   $21 = ($20|0)==(1);
   $22 = ($23|0)==(1);
   $or$cond1 = $21 & $22;
   if ($or$cond1) {
    $24 = ((($info)) + 54|0);
    HEAP8[$24>>0] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($this,$info,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $is_dst_type_derived_from_static_type$0$off02 = 0, $not$ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($info)) + 8|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($this|0)==($1|0);
 do {
  if ($2) {
   $3 = ((($info)) + 4|0);
   $4 = HEAP32[$3>>2]|0;
   $5 = ($4|0)==($current_ptr|0);
   if ($5) {
    $6 = ((($info)) + 28|0);
    $7 = HEAP32[$6>>2]|0;
    $8 = ($7|0)==(1);
    if (!($8)) {
     HEAP32[$6>>2] = $path_below;
    }
   }
  } else {
   $9 = HEAP32[$info>>2]|0;
   $10 = ($this|0)==($9|0);
   if (!($10)) {
    $44 = ((($this)) + 8|0);
    $45 = HEAP32[$44>>2]|0;
    $46 = HEAP32[$45>>2]|0;
    $47 = ((($46)) + 24|0);
    $48 = HEAP32[$47>>2]|0;
    FUNCTION_TABLE_viiiii[$48 & 31]($45,$info,$current_ptr,$path_below,$use_strcmp);
    break;
   }
   $11 = ((($info)) + 16|0);
   $12 = HEAP32[$11>>2]|0;
   $13 = ($12|0)==($current_ptr|0);
   if (!($13)) {
    $14 = ((($info)) + 20|0);
    $15 = HEAP32[$14>>2]|0;
    $16 = ($15|0)==($current_ptr|0);
    if (!($16)) {
     $19 = ((($info)) + 32|0);
     HEAP32[$19>>2] = $path_below;
     $20 = ((($info)) + 44|0);
     $21 = HEAP32[$20>>2]|0;
     $22 = ($21|0)==(4);
     if ($22) {
      break;
     }
     $23 = ((($info)) + 52|0);
     HEAP8[$23>>0] = 0;
     $24 = ((($info)) + 53|0);
     HEAP8[$24>>0] = 0;
     $25 = ((($this)) + 8|0);
     $26 = HEAP32[$25>>2]|0;
     $27 = HEAP32[$26>>2]|0;
     $28 = ((($27)) + 20|0);
     $29 = HEAP32[$28>>2]|0;
     FUNCTION_TABLE_viiiiii[$29 & 31]($26,$info,$current_ptr,$current_ptr,1,$use_strcmp);
     $30 = HEAP8[$24>>0]|0;
     $31 = ($30<<24>>24)==(0);
     if ($31) {
      $is_dst_type_derived_from_static_type$0$off02 = 0;
      label = 13;
     } else {
      $32 = HEAP8[$23>>0]|0;
      $not$ = ($32<<24>>24)==(0);
      if ($not$) {
       $is_dst_type_derived_from_static_type$0$off02 = 1;
       label = 13;
      } else {
       label = 17;
      }
     }
     do {
      if ((label|0) == 13) {
       HEAP32[$14>>2] = $current_ptr;
       $33 = ((($info)) + 40|0);
       $34 = HEAP32[$33>>2]|0;
       $35 = (($34) + 1)|0;
       HEAP32[$33>>2] = $35;
       $36 = ((($info)) + 36|0);
       $37 = HEAP32[$36>>2]|0;
       $38 = ($37|0)==(1);
       if ($38) {
        $39 = ((($info)) + 24|0);
        $40 = HEAP32[$39>>2]|0;
        $41 = ($40|0)==(2);
        if ($41) {
         $42 = ((($info)) + 54|0);
         HEAP8[$42>>0] = 1;
         if ($is_dst_type_derived_from_static_type$0$off02) {
          label = 17;
          break;
         } else {
          $43 = 4;
          break;
         }
        }
       }
       if ($is_dst_type_derived_from_static_type$0$off02) {
        label = 17;
       } else {
        $43 = 4;
       }
      }
     } while(0);
     if ((label|0) == 17) {
      $43 = 3;
     }
     HEAP32[$20>>2] = $43;
     break;
    }
   }
   $17 = ($path_below|0)==(1);
   if ($17) {
    $18 = ((($info)) + 32|0);
    HEAP32[$18>>2] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($this,$info,$adjustedPtr,$path_below) {
 $this = $this|0;
 $info = $info|0;
 $adjustedPtr = $adjustedPtr|0;
 $path_below = $path_below|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($info)) + 8|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($this|0)==($1|0);
 do {
  if ($2) {
   $3 = ((($info)) + 16|0);
   $4 = HEAP32[$3>>2]|0;
   $5 = ($4|0)==(0|0);
   if ($5) {
    HEAP32[$3>>2] = $adjustedPtr;
    $6 = ((($info)) + 24|0);
    HEAP32[$6>>2] = $path_below;
    $7 = ((($info)) + 36|0);
    HEAP32[$7>>2] = 1;
    break;
   }
   $8 = ($4|0)==($adjustedPtr|0);
   if (!($8)) {
    $12 = ((($info)) + 36|0);
    $13 = HEAP32[$12>>2]|0;
    $14 = (($13) + 1)|0;
    HEAP32[$12>>2] = $14;
    $15 = ((($info)) + 24|0);
    HEAP32[$15>>2] = 2;
    $16 = ((($info)) + 54|0);
    HEAP8[$16>>0] = 1;
    break;
   }
   $9 = ((($info)) + 24|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = ($10|0)==(2);
   if ($11) {
    HEAP32[$9>>2] = $path_below;
   }
  } else {
   $17 = ((($this)) + 8|0);
   $18 = HEAP32[$17>>2]|0;
   $19 = HEAP32[$18>>2]|0;
   $20 = ((($19)) + 28|0);
   $21 = HEAP32[$20>>2]|0;
   FUNCTION_TABLE_viiii[$21 & 31]($18,$info,$adjustedPtr,$path_below);
  }
 } while(0);
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _free($this);
 return;
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($this,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $dst_ptr = $dst_ptr|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($info)) + 8|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($this|0)==($1|0);
 if ($2) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($info,$dst_ptr,$current_ptr,$path_below);
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($this,$info,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($info)) + 8|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($this|0)==($1|0);
 do {
  if ($2) {
   $3 = ((($info)) + 4|0);
   $4 = HEAP32[$3>>2]|0;
   $5 = ($4|0)==($current_ptr|0);
   if ($5) {
    $6 = ((($info)) + 28|0);
    $7 = HEAP32[$6>>2]|0;
    $8 = ($7|0)==(1);
    if (!($8)) {
     HEAP32[$6>>2] = $path_below;
    }
   }
  } else {
   $9 = HEAP32[$info>>2]|0;
   $10 = ($this|0)==($9|0);
   if ($10) {
    $11 = ((($info)) + 16|0);
    $12 = HEAP32[$11>>2]|0;
    $13 = ($12|0)==($current_ptr|0);
    if (!($13)) {
     $14 = ((($info)) + 20|0);
     $15 = HEAP32[$14>>2]|0;
     $16 = ($15|0)==($current_ptr|0);
     if (!($16)) {
      $19 = ((($info)) + 32|0);
      HEAP32[$19>>2] = $path_below;
      HEAP32[$14>>2] = $current_ptr;
      $20 = ((($info)) + 40|0);
      $21 = HEAP32[$20>>2]|0;
      $22 = (($21) + 1)|0;
      HEAP32[$20>>2] = $22;
      $23 = ((($info)) + 36|0);
      $24 = HEAP32[$23>>2]|0;
      $25 = ($24|0)==(1);
      if ($25) {
       $26 = ((($info)) + 24|0);
       $27 = HEAP32[$26>>2]|0;
       $28 = ($27|0)==(2);
       if ($28) {
        $29 = ((($info)) + 54|0);
        HEAP8[$29>>0] = 1;
       }
      }
      $30 = ((($info)) + 44|0);
      HEAP32[$30>>2] = 4;
      break;
     }
    }
    $17 = ($path_below|0)==(1);
    if ($17) {
     $18 = ((($info)) + 32|0);
     HEAP32[$18>>2] = 1;
    }
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($this,$info,$adjustedPtr,$path_below) {
 $this = $this|0;
 $info = $info|0;
 $adjustedPtr = $adjustedPtr|0;
 $path_below = $path_below|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($info)) + 8|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($this|0)==($1|0);
 do {
  if ($2) {
   $3 = ((($info)) + 16|0);
   $4 = HEAP32[$3>>2]|0;
   $5 = ($4|0)==(0|0);
   if ($5) {
    HEAP32[$3>>2] = $adjustedPtr;
    $6 = ((($info)) + 24|0);
    HEAP32[$6>>2] = $path_below;
    $7 = ((($info)) + 36|0);
    HEAP32[$7>>2] = 1;
    break;
   }
   $8 = ($4|0)==($adjustedPtr|0);
   if (!($8)) {
    $12 = ((($info)) + 36|0);
    $13 = HEAP32[$12>>2]|0;
    $14 = (($13) + 1)|0;
    HEAP32[$12>>2] = $14;
    $15 = ((($info)) + 24|0);
    HEAP32[$15>>2] = 2;
    $16 = ((($info)) + 54|0);
    HEAP8[$16>>0] = 1;
    break;
   }
   $9 = ((($info)) + 24|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = ($10|0)==(2);
   if ($11) {
    HEAP32[$9>>2] = $path_below;
   }
  }
 } while(0);
 return;
}
function __ZNSt9bad_allocD2Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNSt9bad_allocD0Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _free($this);
 return;
}
function __ZNKSt9bad_alloc4whatEv($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (17205|0);
}
function ___cxa_can_catch($catchType,$excpType,$thrown) {
 $catchType = $catchType|0;
 $excpType = $excpType|0;
 $thrown = $thrown|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $temp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $temp = sp;
 $0 = HEAP32[$thrown>>2]|0;
 HEAP32[$temp>>2] = $0;
 $1 = HEAP32[$catchType>>2]|0;
 $2 = ((($1)) + 16|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = (FUNCTION_TABLE_iiii[$3 & 31]($catchType,$excpType,$temp)|0);
 $5 = $4&1;
 if ($4) {
  $6 = HEAP32[$temp>>2]|0;
  HEAP32[$thrown>>2] = $6;
 }
 STACKTOP = sp;return ($5|0);
}
function ___cxa_is_pointer_type($type) {
 $type = $type|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($type|0)==(0|0);
 if ($0) {
  $3 = 0;
 } else {
  $1 = (___dynamic_cast($type,104)|0);
  $phitmp = ($1|0)!=(0|0);
  $3 = $phitmp;
 }
 $2 = $3&1;
 return ($2|0);
}
function runPostSets() {
}
function _i64Subtract(a, b, c, d) {
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a - c)>>>0;
    h = (b - d)>>>0;
    h = (b - d - (((c>>>0) > (a>>>0))|0))>>>0; // Borrow one from high word to low word on underflow.
    return ((tempRet0 = h,l|0)|0);
}
function _i64Add(a, b, c, d) {
    /*
      x = a + b*2^32
      y = c + d*2^32
      result = l + h*2^32
    */
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a + c)>>>0;
    h = (b + d + (((l>>>0) < (a>>>0))|0))>>>0; // Add carry from low word to high word on overflow.
    return ((tempRet0 = h,l|0)|0);
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var stop = 0, value4 = 0, stop4 = 0, unaligned = 0;
    stop = (ptr + num)|0;
    if ((num|0) >= 20) {
      // This is unaligned, but quite large, so work hard to get to aligned settings
      value = value & 0xff;
      unaligned = ptr & 3;
      value4 = value | (value << 8) | (value << 16) | (value << 24);
      stop4 = stop & ~3;
      if (unaligned) {
        unaligned = (ptr + 4 - unaligned)|0;
        while ((ptr|0) < (unaligned|0)) { // no need to check for stop, since we have large num
          HEAP8[((ptr)>>0)]=value;
          ptr = (ptr+1)|0;
        }
      }
      while ((ptr|0) < (stop4|0)) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    while ((ptr|0) < (stop|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (ptr-num)|0;
}
function _bitshift64Lshr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >>> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = 0;
    return (high >>> (bits - 32))|0;
}
function _bitshift64Shl(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = (high << bits) | ((low&(ander << (32 - bits))) >>> (32 - bits));
      return low << bits;
    }
    tempRet0 = low << (bits - 32);
    return 0;
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    if ((num|0) >= 4096) return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    ret = dest|0;
    if ((dest&3) == (src&3)) {
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      while ((num|0) >= 4) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
        num = (num-4)|0;
      }
    }
    while ((num|0) > 0) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
      num = (num-1)|0;
    }
    return ret|0;
}
function _memmove(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    if (((src|0) < (dest|0)) & ((dest|0) < ((src + num)|0))) {
      // Unlikely case: Copy backwards in a safe manner
      ret = dest;
      src = (src + num)|0;
      dest = (dest + num)|0;
      while ((num|0) > 0) {
        dest = (dest - 1)|0;
        src = (src - 1)|0;
        num = (num - 1)|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      }
      dest = ret;
    } else {
      _memcpy(dest, src, num) | 0;
    }
    return dest | 0;
}
function _llvm_bswap_i32(x) {
    x = x|0;
    return (((x&0xff)<<24) | (((x>>8)&0xff)<<16) | (((x>>16)&0xff)<<8) | (x>>>24))|0;
}
function _bitshift64Ashr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = (high|0) < 0 ? -1 : 0;
    return (high >> (bits - 32))|0;
  }
function _llvm_cttz_i32(x) {
    x = x|0;
    var ret = 0;
    ret = ((HEAP8[(((cttz_i8)+(x & 0xff))>>0)])|0);
    if ((ret|0) < 8) return ret|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 8)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 8)|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 16)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 16)|0;
    return (((HEAP8[(((cttz_i8)+(x >>> 24))>>0)])|0) + 24)|0;
  }

// ======== compiled code from system/lib/compiler-rt , see readme therein
function ___muldsi3($a, $b) {
  $a = $a | 0;
  $b = $b | 0;
  var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
  $1 = $a & 65535;
  $2 = $b & 65535;
  $3 = Math_imul($2, $1) | 0;
  $6 = $a >>> 16;
  $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0;
  $11 = $b >>> 16;
  $12 = Math_imul($11, $1) | 0;
  return (tempRet0 = (($8 >>> 16) + (Math_imul($11, $6) | 0) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, 0 | ($8 + $12 << 16 | $3 & 65535)) | 0;
}
function ___divdi3($a$0, $a$1, $b$0, $b$1) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  var $1$0 = 0, $1$1 = 0, $2$0 = 0, $2$1 = 0, $4$0 = 0, $4$1 = 0, $6$0 = 0, $7$0 = 0, $7$1 = 0, $8$0 = 0, $10$0 = 0;
  $1$0 = $a$1 >> 31 | (($a$1 | 0) < 0 ? -1 : 0) << 1;
  $1$1 = (($a$1 | 0) < 0 ? -1 : 0) >> 31 | (($a$1 | 0) < 0 ? -1 : 0) << 1;
  $2$0 = $b$1 >> 31 | (($b$1 | 0) < 0 ? -1 : 0) << 1;
  $2$1 = (($b$1 | 0) < 0 ? -1 : 0) >> 31 | (($b$1 | 0) < 0 ? -1 : 0) << 1;
  $4$0 = _i64Subtract($1$0 ^ $a$0 | 0, $1$1 ^ $a$1 | 0, $1$0 | 0, $1$1 | 0) | 0;
  $4$1 = tempRet0;
  $6$0 = _i64Subtract($2$0 ^ $b$0 | 0, $2$1 ^ $b$1 | 0, $2$0 | 0, $2$1 | 0) | 0;
  $7$0 = $2$0 ^ $1$0;
  $7$1 = $2$1 ^ $1$1;
  $8$0 = ___udivmoddi4($4$0, $4$1, $6$0, tempRet0, 0) | 0;
  $10$0 = _i64Subtract($8$0 ^ $7$0 | 0, tempRet0 ^ $7$1 | 0, $7$0 | 0, $7$1 | 0) | 0;
  return $10$0 | 0;
}
function ___remdi3($a$0, $a$1, $b$0, $b$1) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  var $rem = 0, $1$0 = 0, $1$1 = 0, $2$0 = 0, $2$1 = 0, $4$0 = 0, $4$1 = 0, $6$0 = 0, $10$0 = 0, $10$1 = 0, __stackBase__ = 0;
  __stackBase__ = STACKTOP;
  STACKTOP = STACKTOP + 16 | 0;
  $rem = __stackBase__ | 0;
  $1$0 = $a$1 >> 31 | (($a$1 | 0) < 0 ? -1 : 0) << 1;
  $1$1 = (($a$1 | 0) < 0 ? -1 : 0) >> 31 | (($a$1 | 0) < 0 ? -1 : 0) << 1;
  $2$0 = $b$1 >> 31 | (($b$1 | 0) < 0 ? -1 : 0) << 1;
  $2$1 = (($b$1 | 0) < 0 ? -1 : 0) >> 31 | (($b$1 | 0) < 0 ? -1 : 0) << 1;
  $4$0 = _i64Subtract($1$0 ^ $a$0 | 0, $1$1 ^ $a$1 | 0, $1$0 | 0, $1$1 | 0) | 0;
  $4$1 = tempRet0;
  $6$0 = _i64Subtract($2$0 ^ $b$0 | 0, $2$1 ^ $b$1 | 0, $2$0 | 0, $2$1 | 0) | 0;
  ___udivmoddi4($4$0, $4$1, $6$0, tempRet0, $rem) | 0;
  $10$0 = _i64Subtract(HEAP32[$rem >> 2] ^ $1$0 | 0, HEAP32[$rem + 4 >> 2] ^ $1$1 | 0, $1$0 | 0, $1$1 | 0) | 0;
  $10$1 = tempRet0;
  STACKTOP = __stackBase__;
  return (tempRet0 = $10$1, $10$0) | 0;
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0, $2 = 0;
  $x_sroa_0_0_extract_trunc = $a$0;
  $y_sroa_0_0_extract_trunc = $b$0;
  $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0;
  $1$1 = tempRet0;
  $2 = Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0;
  return (tempRet0 = ((Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $2 | 0) + $1$1 | $1$1 & 0, 0 | $1$0 & -1) | 0;
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  var $1$0 = 0;
  $1$0 = ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0;
  return $1$0 | 0;
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  var $rem = 0, __stackBase__ = 0;
  __stackBase__ = STACKTOP;
  STACKTOP = STACKTOP + 16 | 0;
  $rem = __stackBase__ | 0;
  ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0;
  STACKTOP = __stackBase__;
  return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  $rem = $rem | 0;
  var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $49 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $86 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $117 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $147 = 0, $149 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $152 = 0, $154$0 = 0, $r_sroa_0_0_extract_trunc = 0, $r_sroa_1_4_extract_trunc = 0, $155 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $q_sroa_0_0_insert_insert77$1 = 0, $_0$0 = 0, $_0$1 = 0;
  $n_sroa_0_0_extract_trunc = $a$0;
  $n_sroa_1_4_extract_shift$0 = $a$1;
  $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0;
  $d_sroa_0_0_extract_trunc = $b$0;
  $d_sroa_1_4_extract_shift$0 = $b$1;
  $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0;
  if (($n_sroa_1_4_extract_trunc | 0) == 0) {
    $4 = ($rem | 0) != 0;
    if (($d_sroa_1_4_extract_trunc | 0) == 0) {
      if ($4) {
        HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
        HEAP32[$rem + 4 >> 2] = 0;
      }
      $_0$1 = 0;
      $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
      return (tempRet0 = $_0$1, $_0$0) | 0;
    } else {
      if (!$4) {
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      HEAP32[$rem >> 2] = $a$0 & -1;
      HEAP32[$rem + 4 >> 2] = $a$1 & 0;
      $_0$1 = 0;
      $_0$0 = 0;
      return (tempRet0 = $_0$1, $_0$0) | 0;
    }
  }
  $17 = ($d_sroa_1_4_extract_trunc | 0) == 0;
  do {
    if (($d_sroa_0_0_extract_trunc | 0) == 0) {
      if ($17) {
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
          HEAP32[$rem + 4 >> 2] = 0;
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      if (($n_sroa_0_0_extract_trunc | 0) == 0) {
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = 0;
          HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0);
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      $37 = $d_sroa_1_4_extract_trunc - 1 | 0;
      if (($37 & $d_sroa_1_4_extract_trunc | 0) == 0) {
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = 0 | $a$0 & -1;
          HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0;
        }
        $_0$1 = 0;
        $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0);
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      $49 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
      $51 = $49 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
      if ($51 >>> 0 <= 30) {
        $57 = $51 + 1 | 0;
        $58 = 31 - $51 | 0;
        $sr_1_ph = $57;
        $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0);
        $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0);
        $q_sroa_0_1_ph = 0;
        $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58;
        break;
      }
      if (($rem | 0) == 0) {
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      HEAP32[$rem >> 2] = 0 | $a$0 & -1;
      HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
      $_0$1 = 0;
      $_0$0 = 0;
      return (tempRet0 = $_0$1, $_0$0) | 0;
    } else {
      if (!$17) {
        $117 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
        $119 = $117 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        if ($119 >>> 0 <= 31) {
          $125 = $119 + 1 | 0;
          $126 = 31 - $119 | 0;
          $130 = $119 - 31 >> 31;
          $sr_1_ph = $125;
          $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126;
          $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130;
          $q_sroa_0_1_ph = 0;
          $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126;
          break;
        }
        if (($rem | 0) == 0) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = 0 | $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      $66 = $d_sroa_0_0_extract_trunc - 1 | 0;
      if (($66 & $d_sroa_0_0_extract_trunc | 0) != 0) {
        $86 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 | 0;
        $88 = $86 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        $89 = 64 - $88 | 0;
        $91 = 32 - $88 | 0;
        $92 = $91 >> 31;
        $95 = $88 - 32 | 0;
        $105 = $95 >> 31;
        $sr_1_ph = $88;
        $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105;
        $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0);
        $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92;
        $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31;
        break;
      }
      if (($rem | 0) != 0) {
        HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc;
        HEAP32[$rem + 4 >> 2] = 0;
      }
      if (($d_sroa_0_0_extract_trunc | 0) == 1) {
        $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$0 = 0 | $a$0 & -1;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0;
        $_0$1 = 0 | $n_sroa_1_4_extract_trunc >>> ($78 >>> 0);
        $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
    }
  } while (0);
  if (($sr_1_ph | 0) == 0) {
    $q_sroa_1_1_lcssa = $q_sroa_1_1_ph;
    $q_sroa_0_1_lcssa = $q_sroa_0_1_ph;
    $r_sroa_1_1_lcssa = $r_sroa_1_1_ph;
    $r_sroa_0_1_lcssa = $r_sroa_0_1_ph;
    $carry_0_lcssa$1 = 0;
    $carry_0_lcssa$0 = 0;
  } else {
    $d_sroa_0_0_insert_insert99$0 = 0 | $b$0 & -1;
    $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0;
    $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0;
    $137$1 = tempRet0;
    $q_sroa_1_1198 = $q_sroa_1_1_ph;
    $q_sroa_0_1199 = $q_sroa_0_1_ph;
    $r_sroa_1_1200 = $r_sroa_1_1_ph;
    $r_sroa_0_1201 = $r_sroa_0_1_ph;
    $sr_1202 = $sr_1_ph;
    $carry_0203 = 0;
    while (1) {
      $147 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1;
      $149 = $carry_0203 | $q_sroa_0_1199 << 1;
      $r_sroa_0_0_insert_insert42$0 = 0 | ($r_sroa_0_1201 << 1 | $q_sroa_1_1198 >>> 31);
      $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0;
      _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0;
      $150$1 = tempRet0;
      $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1;
      $152 = $151$0 & 1;
      $154$0 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0;
      $r_sroa_0_0_extract_trunc = $154$0;
      $r_sroa_1_4_extract_trunc = tempRet0;
      $155 = $sr_1202 - 1 | 0;
      if (($155 | 0) == 0) {
        break;
      } else {
        $q_sroa_1_1198 = $147;
        $q_sroa_0_1199 = $149;
        $r_sroa_1_1200 = $r_sroa_1_4_extract_trunc;
        $r_sroa_0_1201 = $r_sroa_0_0_extract_trunc;
        $sr_1202 = $155;
        $carry_0203 = $152;
      }
    }
    $q_sroa_1_1_lcssa = $147;
    $q_sroa_0_1_lcssa = $149;
    $r_sroa_1_1_lcssa = $r_sroa_1_4_extract_trunc;
    $r_sroa_0_1_lcssa = $r_sroa_0_0_extract_trunc;
    $carry_0_lcssa$1 = 0;
    $carry_0_lcssa$0 = $152;
  }
  $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa;
  $q_sroa_0_0_insert_ext75$1 = 0;
  $q_sroa_0_0_insert_insert77$1 = $q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1;
  if (($rem | 0) != 0) {
    HEAP32[$rem >> 2] = 0 | $r_sroa_0_1_lcssa;
    HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa | 0;
  }
  $_0$1 = (0 | $q_sroa_0_0_insert_ext75$0) >>> 31 | $q_sroa_0_0_insert_insert77$1 << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1;
  $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0;
  return (tempRet0 = $_0$1, $_0$0) | 0;
}
// =======================================================================



  
function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&31](a1|0,a2|0,a3|0)|0;
}


function dynCall_viiiii(index,a1,a2,a3,a4,a5) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0;
  FUNCTION_TABLE_viiiii[index&31](a1|0,a2|0,a3|0,a4|0,a5|0);
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&31](a1|0);
}


function dynCall_vii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  FUNCTION_TABLE_vii[index&31](a1|0,a2|0);
}


function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&31](a1|0)|0;
}


function dynCall_v(index) {
  index = index|0;
  
  FUNCTION_TABLE_v[index&0]();
}


function dynCall_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0;
  FUNCTION_TABLE_viiiiii[index&31](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0);
}


function dynCall_iii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  return FUNCTION_TABLE_iii[index&7](a1|0,a2|0)|0;
}


function dynCall_viiii(index,a1,a2,a3,a4) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0;
  FUNCTION_TABLE_viiii[index&31](a1|0,a2|0,a3|0,a4|0);
}

function b0(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(0);return 0;
}
function b1(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; nullFunc_viiiii(1);
}
function b2(p0) {
 p0 = p0|0; nullFunc_vi(2);
}
function b3(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_vii(3);
}
function b4(p0) {
 p0 = p0|0; nullFunc_ii(4);return 0;
}
function b5() {
 ; nullFunc_v(5);
}
function b6(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; nullFunc_viiiiii(6);
}
function b7(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_iii(7);return 0;
}
function b8(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; nullFunc_viiii(8);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_iiii = [b0,__ZL7js_readP5hFILEPvj,__ZL7js_seekP5hFILEii,b0,b0,b0,b0,b0,___stdio_write,___stdio_seek,___stdout_write,_sn_write,b0,b0,b0,b0,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,_zcalloc
,b0,b0,b0];
var FUNCTION_TABLE_viiiii = [b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b1,b1,b1,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b1,b1,b1,b1,b1,b1
,b1,b1,b1];
var FUNCTION_TABLE_vi = [b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,b2,b2,b2,b2,__ZN10__cxxabiv120__si_class_type_infoD0Ev,b2,b2,b2,__ZNSt9bad_allocD2Ev,__ZNSt9bad_allocD0Ev,b2,__ZNSt3__13mapIiP7htsFileNS_4lessIiEENS_9allocatorINS_4pairIKiS2_EEEEED2Ev,b2
,b2,_cleanup_604,b2];
var FUNCTION_TABLE_vii = [b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,_zcfree,b3,b3];
var FUNCTION_TABLE_ii = [b4,b4,b4,__ZL8js_closeP5hFILE,b4,b4,b4,___stdio_close,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,__ZNKSt9bad_alloc4whatEv,b4,b4
,b4,b4,b4];
var FUNCTION_TABLE_v = [b5];
var FUNCTION_TABLE_viiiiii = [b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b6,b6,b6,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6];
var FUNCTION_TABLE_iii = [b7,b7,b7,b7,_deflate_stored,_deflate_fast,_deflate_slow,b7];
var FUNCTION_TABLE_viiii = [b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b8,b8,b8,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b8,b8,b8,b8,b8
,b8,b8,b8];

  return { _bgzf_open_js: _bgzf_open_js, ___cxa_can_catch: ___cxa_can_catch, _free: _free, _ntohs: _ntohs, _htonl: _htonl, ___cxa_is_pointer_type: ___cxa_is_pointer_type, _i64Add: _i64Add, _memmove: _memmove, _i64Subtract: _i64Subtract, _memset: _memset, _malloc: _malloc, _memcpy: _memcpy, _bitshift64Lshr: _bitshift64Lshr, _htons: _htons, _llvm_bswap_i32: _llvm_bswap_i32, _bitshift64Shl: _bitshift64Shl, __GLOBAL__sub_I_bam_cpp: __GLOBAL__sub_I_bam_cpp, runPostSets: runPostSets, stackAlloc: stackAlloc, stackSave: stackSave, stackRestore: stackRestore, establishStackSpace: establishStackSpace, setThrew: setThrew, setTempRet0: setTempRet0, getTempRet0: getTempRet0, dynCall_iiii: dynCall_iiii, dynCall_viiiii: dynCall_viiiii, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_ii: dynCall_ii, dynCall_v: dynCall_v, dynCall_viiiiii: dynCall_viiiiii, dynCall_iii: dynCall_iii, dynCall_viiii: dynCall_viiii };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);
var real__bgzf_open_js = asm["_bgzf_open_js"]; asm["_bgzf_open_js"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bgzf_open_js.apply(null, arguments);
};

var real____cxa_can_catch = asm["___cxa_can_catch"]; asm["___cxa_can_catch"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____cxa_can_catch.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__free.apply(null, arguments);
};

var real__ntohs = asm["_ntohs"]; asm["_ntohs"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__ntohs.apply(null, arguments);
};

var real__htonl = asm["_htonl"]; asm["_htonl"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__htonl.apply(null, arguments);
};

var real____cxa_is_pointer_type = asm["___cxa_is_pointer_type"]; asm["___cxa_is_pointer_type"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____cxa_is_pointer_type.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__i64Add.apply(null, arguments);
};

var real__memmove = asm["_memmove"]; asm["_memmove"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__memmove.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__i64Subtract.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__malloc.apply(null, arguments);
};

var real___GLOBAL__sub_I_bam_cpp = asm["__GLOBAL__sub_I_bam_cpp"]; asm["__GLOBAL__sub_I_bam_cpp"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real___GLOBAL__sub_I_bam_cpp.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bitshift64Lshr.apply(null, arguments);
};

var real__htons = asm["_htons"]; asm["_htons"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__htons.apply(null, arguments);
};

var real__llvm_bswap_i32 = asm["_llvm_bswap_i32"]; asm["_llvm_bswap_i32"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__llvm_bswap_i32.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bitshift64Shl.apply(null, arguments);
};
var _bgzf_open_js = Module["_bgzf_open_js"] = asm["_bgzf_open_js"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var ___cxa_can_catch = Module["___cxa_can_catch"] = asm["___cxa_can_catch"];
var _free = Module["_free"] = asm["_free"];
var _ntohs = Module["_ntohs"] = asm["_ntohs"];
var _htonl = Module["_htonl"] = asm["_htonl"];
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _memmove = Module["_memmove"] = asm["_memmove"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var _memset = Module["_memset"] = asm["_memset"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var __GLOBAL__sub_I_bam_cpp = Module["__GLOBAL__sub_I_bam_cpp"] = asm["__GLOBAL__sub_I_bam_cpp"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _htons = Module["_htons"] = asm["_htons"];
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
;

Runtime.stackAlloc = asm['stackAlloc'];
Runtime.stackSave = asm['stackSave'];
Runtime.stackRestore = asm['stackRestore'];
Runtime.establishStackSpace = asm['establishStackSpace'];

Runtime.setTempRet0 = asm['setTempRet0'];
Runtime.getTempRet0 = asm['getTempRet0'];



// === Auto-generated postamble setup entry stuff ===




function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var preloadStartTime = null;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = Module.callMain = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  function pad() {
    for (var i = 0; i < 4-1; i++) {
      argv.push(0);
    }
  }
  var argv = [allocate(intArrayFromString(Module['thisProgram']), 'i8', ALLOC_NORMAL) ];
  pad();
  for (var i = 0; i < argc-1; i = i + 1) {
    argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_NORMAL));
    pad();
  }
  argv.push(0);
  argv = allocate(argv, 'i32', ALLOC_NORMAL);


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
    exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      if (e && typeof e === 'object' && e.stack) Module.printErr('exception thrown: ' + [e, e.stack]);
      throw e;
    }
  } finally {
    calledMain = true;
  }
}




function run(args) {
  args = args || Module['arguments'];

  if (preloadStartTime === null) preloadStartTime = Date.now();

  if (runDependencies > 0) {
    Module.printErr('run() called, but dependencies remain, so not running');
    return;
  }

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return; 

    ensureInitRuntime();

    preMain();

    if (ENVIRONMENT_IS_WEB && preloadStartTime !== null) {
      Module.printErr('pre-main prep time: ' + (Date.now() - preloadStartTime) + ' ms');
    }

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
}
Module['run'] = Module.run = run;

function exit(status, implicit) {
  if (implicit && Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') implicitly called by end of main(), but noExitRuntime, so not exiting the runtime (you can use emscripten_force_exit, if you want to force a true shutdown)');
    return;
  }

  if (Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') called, but noExitRuntime, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)');
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  } else if (ENVIRONMENT_IS_SHELL && typeof quit === 'function') {
    quit(status);
  }
  // if we reach here, we must throw an exception to halt the current execution
  throw new ExitStatus(status);
}
Module['exit'] = Module.exit = exit;

var abortDecorators = [];

function abort(what) {
  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';

  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = Module.abort = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}


run();

// {{POST_RUN_ADDITIONS}}


var workerResponded = false, workerCallbackId = -1;

(function() {
  var messageBuffer = null, buffer = 0, bufferSize = 0;

  function flushMessages() {
    if (!messageBuffer) return;
    if (runtimeInitialized) {
      var temp = messageBuffer;
      messageBuffer = null;
      temp.forEach(function(message) {
        onmessage(message);
      });
    }
  }

  function messageResender() {
    flushMessages();
    if (messageBuffer) {
      setTimeout(messageResender, 100); // still more to do
    }
  }

  onmessage = function onmessage(msg) {
    // if main has not yet been called (mem init file, other async things), buffer messages
    if (!runtimeInitialized) {
      if (!messageBuffer) {
        messageBuffer = [];
        setTimeout(messageResender, 100);
      }
      messageBuffer.push(msg);
      return;
    }
    flushMessages();

    var func = Module['_' + msg.data['funcName']];
    if (!func) throw 'invalid worker function to call: ' + msg.data['funcName'];
    var data = msg.data['data'];
    if (data) {
      if (!data.byteLength) data = new Uint8Array(data);
      if (!buffer || bufferSize < data.length) {
        if (buffer) _free(buffer);
        bufferSize = data.length;
        buffer = _malloc(data.length);
      }
      HEAPU8.set(data, buffer);
    }

    workerResponded = false;
    workerCallbackId = msg.data['callbackId'];
    if (data) {
      func(buffer, data.length);
    } else {
      func(0, 0);
    }
  }
})();






// {{MODULE_ADDITIONS}}



var htsfiles = {};

function Htsfile(fileobj) {
    this.reader = new FileReaderSync();
    this.offset = 0;
    this.cursor = -1;
    this.bufsize = 4194304; // 4 MiB
    this.buf = undefined;
    this.fileobj = fileobj;
    this.eof = 0;
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
    if (this.offset != offset) {
        if (this.offset < offset && offset < this.offset+this.bufsize) {
            this.cursor = offset - this.offset;
        } else {
            this.offset = offset;
            this.cursor = -1;
        }
    }
    return this.offset + this.cursor;
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

function sam_hdr_read(f) {
    return Module._sam_hdr_read_js(f);
}

