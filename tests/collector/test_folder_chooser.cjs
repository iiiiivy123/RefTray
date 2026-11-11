const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('cancel while native picker starts closes that request and keeps the old destination',async()=>{
 let draft={requestId:'ours',options:{destination:'F:/old'}}, releaseStart;
 const started=new Promise(resolve=>releaseStart=resolve),calls=[];
 const context=vm.createContext({setTimeout,AbortSignal,reftrayApiError:()=>'',reftrayHealth:async()=>({json:async()=>({settings_token:'test'})}),
  chrome:{storage:{local:{get:async()=>({collectorPopupDraft:draft}),set:async value=>{draft=value.collectorPopupDraft;}}}},
  fetch:async(url,options)=>{calls.push([url,options.method]);
   if(url.endsWith('/choose-folder')){await started;return {ok:true,json:async()=>({id:'native-1'})};}
   return {ok:true,json:async()=>url.endsWith('/cancel')?{state:'cancelling'}:{state:'done',directory:'F:/new',cancelled:false}};
  }});
 vm.runInContext(fs.readFileSync('source/extension/folder-chooser.js','utf8'),context);
 const choosing=vm.runInContext("FolderChooser.choose('ours')",context);
 const cancelling=vm.runInContext("FolderChooser.cancel('ours')",context);
 releaseStart();const result=await choosing;await cancelling;
 assert.equal(result.cancelled,true);assert.equal(draft.options.destination,'F:/old');
 assert.equal(calls.filter(([url,method])=>url.endsWith('/native-1/cancel')&&method==='POST').length,1);
});
