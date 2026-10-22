/* Classroom observation bridge. User source is compiled without this first. */
#include <stdio.h>
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
static int _pvz_events=0, _pvz_output_count=0;
static void _pvz_quote(const char *s) {
    const unsigned char *p=(const unsigned char*)s;
    fputc('"',stdout);
    for(;*p;p++) {
        if(*p=='"'||*p=='\\'){fputc('\\',stdout);fputc(*p,stdout);}
        else if(*p<32)fprintf(stdout,"\\u%04x",*p);
        else fputc(*p,stdout);
    }
    fputc('"',stdout);
}
static void _pvz_record(const char *name,double value,int line) {
    if(++_pvz_events>20000){fprintf(stdout,"{\"type\":\"limit\"}\n");fflush(stdout);exit(125);}
    if(!isfinite(value))return;
    fputs("{\"type\":\"var\",\"name\":",stdout);_pvz_quote(name);
    fprintf(stdout,",\"value\":%.17g,\"line\":%d}\n",value,line);fflush(stdout);
}
static int _pvz_printf_at(int line,const char *fmt,...) {
    char text[64001];int n;va_list ap;va_start(ap,fmt);
    n=vsnprintf(text,sizeof(text),fmt,ap);va_end(ap);text[64000]=0;
    if(n<0||n>64000||(_pvz_output_count+=n)>64000){fputs("{\"type\":\"limit\"}\n",stdout);fflush(stdout);exit(125);}
    fputs("{\"type\":\"output\",\"text\":",stdout);_pvz_quote(text);fprintf(stdout,",\"line\":%d}\n",line);fflush(stdout);return n;
}
static int _pvz_puts_at(int line,const char *s){int n=_pvz_printf_at(line,"%s\n",s);return n<0?EOF:0;}
static int _pvz_putchar_at(int line,int c){_pvz_printf_at(line,"%c",c);return (unsigned char)c;}
#define _PVZ_VALUE(name,expression,line) ({__typeof__(expression) _pvz_temp=(expression);_pvz_record(#name,(double)(name),line);_pvz_temp;})
#define _PVZ_INIT(name,expression,line) ({__typeof__(name) _pvz_temp=(expression);_pvz_record(#name,(double)_pvz_temp,line);_pvz_temp;})
#define printf(...) _pvz_printf_at(__LINE__,__VA_ARGS__)
#define puts(s) _pvz_puts_at(__LINE__,s)
#define putchar(c) _pvz_putchar_at(__LINE__,c)

static void _pvz_request_input(int line) {
    fprintf(stdout,"{\"type\":\"input\",\"line\":%d}\n",line);fflush(stdout);
}
static void _pvz_input_done(int line) {
    fprintf(stdout,"{\"type\":\"input_done\",\"line\":%d}\n",line);fflush(stdout);
}
#define scanf(...) ({int _pvz_read_result;_pvz_request_input(__LINE__);_pvz_read_result=(scanf)(__VA_ARGS__);_pvz_input_done(__LINE__);_pvz_read_result;})
