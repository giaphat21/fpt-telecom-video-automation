'use strict';
require('../../config/paths');
const send=message=>{if(process.connected)process.send(message);};
process.once('message',async ({type,payload})=>{
  try {
    let result;
    if(type==='render'){
      const {runFptPipeline}=require('../pipeline/video_pipeline');
      result=await runFptPipeline(payload,msg=>send({type:'log',message:msg}),
        (progress,label)=>send({type:'progress',progress,label}));
    }else if(type==='autosub'){
      result=await require('../speech/subtitle_generator').generateAutoSubtitles(payload);
    }else if(type==='prepare'){
      result=await require('../pipeline/preview').preparePreview(payload);
    }else if(type==='probe'){
      result=require('../media/media_profile').probeMedia(payload.file,payload.kind);
    }else if(type==='crawl-brolls'){
      const crawler=require('../broll/broll_crawler');
      result=payload.topic==='all'?await crawler.crawlAllTopics():[await crawler.crawlBrollTopic(payload.topic)];
    }else if(type==='crawl-fpt'){
      result=await require('../broll/resource_catalog').crawlFptResourcesAndTrends();
    }else throw Error('Tác vụ không hợp lệ.');
    send({type:'result',result});
  }catch(error){send({type:'error',error:error.message,status:error.status});}
  finally{process.disconnect();}
});
