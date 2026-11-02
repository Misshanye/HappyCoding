"""One fresh CPython process per run. Standard library only."""
import sys, json, io, traceback, contextlib, linecache, math, builtins, re

FILENAME = '草坪实战.py'
BOUND = ('hp_pea', 'hp_zombie', 'row_pea', 'row_zombie', 'x', 'x_pea', 'x_zombie', 'remain_hp', 'zombie_steps')

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
    attack_counts = {'pea': 0, 'zombie': 0}
    def classroom_print(*args, **kwargs):
        sep = kwargs.get('sep', ' ')
        text = (' ' if sep is None else sep).join(str(a) for a in args)
        match = re.fullmatch(r'(豌豆|僵尸)攻击(?:X|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)?', text)
        if match and kwargs.get('file') in (None, output):
            frame = sys._getframe(1)
            scope = frame.f_locals
            def value(name):
                if name in scope: v = scope[name]
                elif name in env: v = env[name]
                else: raise NameError("攻击指令需要先定义变量 '%s'" % name)
                if type(v) not in (int, float) or not math.isfinite(v):
                    raise ValueError('%s 必须为有限数值' % name)
                return v
            pea = match[1] == '豌豆'
            damage_name = 'x_pea' if pea else 'x_zombie'
            hp_pea, hp_zombie = value('hp_pea'), value('hp_zombie')
            row_pea, row_zombie = value('row_pea'), value('row_zombie')
            damage = value(damage_name)
            if damage < 0: raise ValueError('%s 不能为负数' % damage_name)
            valid = hp_pea > 0 and hp_zombie > 0 and row_pea == row_zombie
            if valid:
                target = 'hp_zombie' if pea else 'hp_pea'
                remaining = max(0, (hp_zombie if pea else hp_pea) - damage)
                if scope is env or target not in scope:
                    env[target] = remaining
                else:
                    raise RuntimeError('攻击目标生命值请定义为全局变量；函数内请声明 global ' + target)
                attack_counts['pea' if pea else 'zombie'] += 1
        return builtins.print(*args, **kwargs)
    env['print'] = classroom_print
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
        emit({'type': 'output', 'text': value, 'line': frame.f_lineno if frame else 1, 'env': snapshot(), 'attack_counts': dict(attack_counts)})
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
                step = {'line': previous, 'vars': snapshot(), 'desc': '执行第 %s 行后' % previous, 'output_len': output.utf16_units, 'attack_counts': dict(attack_counts)}
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
              'trace_truncated': events > 1500, 'attack_counts': dict(attack_counts)}
    if stream:
        emit({'type': 'result', **result})
    else:
        sys.__stdout__.write(json.dumps(result, ensure_ascii=True, allow_nan=False))

if __name__ == '__main__':
    main()
