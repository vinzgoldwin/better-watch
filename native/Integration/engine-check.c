#include <mpv/client.h>
#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
int main(int argc, char **argv) {
 if(argc != 2) { fprintf(stderr,"Usage: engine-check fixture.mkv\n"); return 1; }
 mpv_handle *m=mpv_create();
 mpv_set_option_string(m,"vo","null"); mpv_set_option_string(m,"ao","null");
 mpv_set_option_string(m,"slang","en,eng,english");mpv_set_option_string(m,"pause","yes");
 if(mpv_initialize(m)<0)return 1;
 const char *args[]={"loadfile",argv[1],NULL};mpv_command(m,args);
 for(int i=0;i<200;i++) {mpv_event *e=mpv_wait_event(m,.1);if(e->event_id==MPV_EVENT_FILE_LOADED)break; if(i==199)return 2;}
 char *sid=mpv_get_property_string(m,"sid"),*count=mpv_get_property_string(m,"track-list/count");
 printf("Embedded English sid=%s totalTracks=%s\n",sid,count);
 if(!sid||atoi(sid)!=2)return 3;mpv_free(sid);mpv_free(count);
 const char *audio[]={"set","aid","2",NULL};if(mpv_command(m,audio)<0)return 4;
 char *aid=mpv_get_property_string(m,"aid");printf("Audio switched to %s\n",aid);if(!aid||atoi(aid)!=2)return 5;mpv_free(aid);
 const char *off[]={"set","sid","no",NULL};mpv_command(m,off);
 sid=mpv_get_property_string(m,"sid");printf("Subtitles disabled: %s\n",sid);mpv_free(sid);
 mpv_terminate_destroy(m);return 0;
}
