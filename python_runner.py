"""One fresh CPython process per run. Standard library only."""
import sys, json, io, traceback, contextlib, linecache, math

FILENAME = '草坪实战.py'
BOUND = ('hp_pea', 'hp_zombie', 'row_pea', 'row_zombie', 'x', 'remain_hp')

class LimitedOutput(io.StringIO):
    on_write = None
    utf16_units = 0
    def write(self, value):
        if self.tell() + len(value) > 64000:
            raise RuntimeError('控制台输出超过 64000 字符，请减少输出')
        count = super().write(value)
        self.utf16_units += len(value.encode("utf-16-le", errors="surrogatepass")) // 2
        if self.on_write and value:
            self.on_write(value)
        return count

def main():
    req = json.loads(_browser_req_json)
    src = req['code']
    # A fresh Python namespace: stage values are display state, never implicit variables.
    env = {'__name__': '__main__'}
    output = LimitedOutput()
    steps = []
    previous = None
    events = 0
    stream = bool(req.get('stream'))
    def emit(event):
        if stream:
            sys.__stdout__.write(json.dumps(event, ensure_ascii=True, allow_nan=False) + '\n')
            sys.__stdout__.flush()
    def snapshot():
        values = {}
        for k, v in list(env.items()):
            if k.startswith('__'):
                continue
            if type(v) in (str, bool, int, float, type(None)):
                if type(v) is int and v.bit_length() > 256:
                    values[k] = '<large int>'
                elif type(v) is float and not math.isfinite(v):
                    values[k] = str(v)
                else:
                    values[k] = v[:2000] if type(v) is str else v
            elif k in BOUND:
                values[k] = {'python_type': type(v).__name__}
        return values
    def on_output(value):
        frame = sys._getframe(1)
        while frame and frame.f_code.co_filename != FILENAME:
            frame = frame.f_back
        emit({'type': 'output', 'text': value, 'line': frame.f_lineno if frame else 1, 'env': snapshot()})
    output.on_write = on_output
    def trace(frame, event, arg):
        nonlocal previous, events
        if frame.f_code.co_filename != FILENAME:
            return trace
        events += 1
        if events > 20000:
            raise RuntimeError('课堂执行步数超过 20000，请检查循环；本次运行已停止')
        if event in ('line', 'return', 'exception'):
            if previous is not None and len(steps) < 1500:
                step = {'line': previous, 'vars': snapshot(), 'desc': '执行第 %s 行后' % previous, 'output_len': output.utf16_units}
                steps.append(step)
                emit({'type': 'step', 'step': step})
            previous = frame.f_lineno if event == 'line' else None
        return trace
    error = None
    linecache.cache[FILENAME] = (len(src), None, src.splitlines(True), FILENAME)
    original_stdin = sys.stdin
    try:
        code = compile(src, FILENAME, 'exec')
        class LiveInput(io.TextIOBase):
            def readable(self): return True
            def readline(self, size=-1):
                emit({'type':'input', 'line':previous or 1, 'env':snapshot()})
                return original_stdin.readline(size)
        sys.stdin = LiveInput() if req.get('interactive') else io.StringIO(req.get('stdin', ''))
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            sys.settrace(trace)
            try:
                exec(code, env, env)
            finally:
                sys.settrace(None)
    except BaseException as exc:
        sys.settrace(None)
        tb = traceback.TracebackException.from_exception(exc)
        tb.stack = traceback.StackSummary.from_list([f for f in tb.stack if f.filename == FILENAME])
        lineno = getattr(exc, 'lineno', None)
        if not lineno and tb.stack:
            lineno = tb.stack[-1].lineno
        error = {'kind': type(exc).__name__, 'line': lineno or 1, 'traceback': ''.join(tb.format())}
    finally:
        sys.stdin = original_stdin
    result = {'env': snapshot(), 'steps': steps, 'stdout': output.getvalue(), 'error': error,
              'trace_truncated': events > 1500}
    if stream:
        emit({'type': 'result', **result})
    else:
        sys.__stdout__.write(json.dumps(result, ensure_ascii=True, allow_nan=False))

if __name__ == '__main__':
    main()
