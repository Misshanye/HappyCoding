# Runtime sources and licenses

Pyodide 314.0.7 is included without changes to its distribution files, under MPL-2.0.
Corresponding source: https://github.com/pyodide/pyodide/tree/314.0.7
Distribution: https://www.npmjs.com/package/pyodide/v/314.0.7
CPython source and license: https://github.com/python/cpython

@live-codes/clang-wasm 0.3.0 is included with its runtime assets, notices and MIT license.
Source: https://github.com/live-codes/clang-wasm
Distribution: https://www.npmjs.com/package/@live-codes/clang-wasm/v/0.3.0
The bundled JavaScript has one appended adapter assigning its entry point to
`self.clangWasmToolchain`, for use in a module Worker. The upstream bundle is otherwise unchanged.
LLVM 22.1.8 source: https://github.com/llvm/llvm-project/tree/llvmorg-22.1.8
See clang-wasm-THIRD-PARTY-NOTICES.md for all bundled components and provenance.

Classroom application source is supplied as the HTML, JavaScript, Python and C header files
in this directory. Its tracking bridge is separate from the upstream runtimes.
