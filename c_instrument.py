"""Observe numeric C bindings without adding declarations or evaluating expressions twice."""
import re
BOUND={'hp_pea','hp_zombie','row_pea','row_zombie','x','remain_hp','alive'}
TOKEN=re.compile(r'(?P<skip>\s+|//[^\n]*|/\*[\s\S]*?\*/)|(?P<literal>"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\')|(?P<pp>^[ \t]*\#[^\n]*(?:\\\n[^\n]*)*)|(?P<word>[A-Za-z_]\w*)|(?P<op>\+\+|--|\+=|-=|\*=|/=|%=|<<=|>>=|&=|\|=|\^=|==|!=|<=|>=|&&|\|\||->|<<|>>)|.',re.M)
ASSIGN={'=','+=','-=','*=','/=','%=','<<=','>>=','&=','|=','^='}
TYPES={'int','float','double','char','short','long','unsigned','signed','_Bool'}
def instrument(src):
    tokens=[]; depth=0
    for m in TOKEN.finditer(src):
        if m.lastgroup in ('skip','pp'):continue
        value=m.group();tokens.append((value,m.start(),m.end(),src.count('\n',0,m.start())+1,depth))
        if value=='{':depth+=1
        elif value=='}':depth-=1
    n=len(tokens)
    def rhs_end(start,limit):
        stack=[]
        for j in range(start,limit):
            v=tokens[j][0]
            if not stack and v in (';',',',')',']','}'):return j
            if v in ('(','[','{'):stack.append(v)
            elif v in (')',']','}'):
                if not stack:return j
                stack.pop()
        return limit
    def declaration(i):
        j=i-1
        while j>=0 and tokens[j][0] not in (';','{','}'):
            j-=1
        prefix=[x[0] for x in tokens[j+1:i]]
        return bool(set(prefix)&TYPES) and not any(x in prefix for x in ('if','while','return')), 'static' in prefix
    globals_seen=[]
    main_start=re.search(r'\bmain\s*\([^)]*\)\s*\{',src)
    for i,t in enumerate(tokens):
        if t[0] in BOUND and t[4]==0 and i+1<n and tokens[i+1][0]=='=' and (not main_start or t[1]<main_start.start()):
            globals_seen.append((t[0],t[3]))
    def walk(lo,hi,left,right):
        out=[];cursor=left;i=lo;static_records={}
        while i<hi:
            t=tokens[i];v=t[0]
            if i in static_records:
                out.extend([src[cursor:t[2]],static_records[i]]);cursor=t[2];i+=1;continue
            # Preserve the exact value of prefix/postfix increments as expressions.
            prefix=v in ('++','--') and i+1<hi and tokens[i+1][0] in BOUND
            postfix=v in BOUND and i+1<hi and tokens[i+1][0] in ('++','--') and (i==0 or tokens[i-1][0] not in ('.','->'))
            if prefix or postfix:
                name=tokens[i+1][0] if prefix else v
                end=tokens[i+1][2];expr=src[t[1]:end]
                out.extend([src[cursor:t[1]],f'_PVZ_VALUE({name},({expr}),{t[3]})']);cursor=end;i+=2;continue
            if v=='scanf' and i+1<hi and tokens[i+1][0]=='(':
                level=1;j=i+2
                while j<hi and level:
                    if tokens[j][0]=='(':level+=1
                    if tokens[j][0]==')':level-=1
                    j+=1
                names=[tokens[k+1][0] for k in range(i+2,j-1) if tokens[k][0]=='&' and tokens[k+1][0] in BOUND]
                if names:
                    call=src[t[1]:tokens[j-1][2]]
                    records=''.join(f'_pvz_record("{name}",(double){name},{t[3]});' for name in names)
                    expr='({int _pvz_scan_result='+call+';if(_pvz_scan_result=='+str(len(names))+'){'+records+'}_pvz_scan_result;})'
                    out.extend([src[cursor:t[1]],expr]);cursor=tokens[j-1][2];i=j;continue
            if v in BOUND and i+1<hi and tokens[i+1][0] in ASSIGN and (i==0 or tokens[i-1][0] not in ('.','->')):
                end=rhs_end(i+2,hi)
                if end<=i+2:i+=1;continue
                endpos=tokens[end-1][2];decl,static=declaration(i)
                if decl and (static or t[4]==0):
                    if static and t[4]>0:
                        j=end
                        while j<hi and tokens[j][0]!=';':j+=1
                        if j<hi:static_records[j]=static_records.get(j,'')+f'_pvz_record("{v}",(double){v},{t[3]});'
                    i=end;continue
                rhs=walk(i+2,end,tokens[i+2][1],endpos)
                if decl and tokens[i+1][0]=='=':
                    start=tokens[i+2][1];replacement=f'_PVZ_INIT({v},({rhs}),{t[3]})'
                else:
                    start=t[1];replacement=f'_PVZ_VALUE({v},({v} {tokens[i+1][0]} {rhs}),{t[3]})'
                out.extend([src[cursor:start],replacement]);cursor=endpos;i=end;continue
            i+=1
        out.append(src[cursor:right]);return ''.join(out)
    result=walk(0,n,0,len(src))
    if globals_seen:
        m=re.search(r'\bmain\s*\([^)]*\)\s*\{',result)
        if m:
            records=''.join(f'_pvz_record("{k}",(double){k},{line});' for k,line in globals_seen)
            result=result[:m.end()]+records+result[m.end():]
    return result
