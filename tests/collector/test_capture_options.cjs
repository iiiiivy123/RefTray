const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Options=require('../../source/extension/capture-options.js');

test('new captures use approved folders while resumed snapshots retain their original schema',()=>{
  assert.equal(Options.browser({mode:'text',scope:'single',options:{}}).directory_schema,'function-platform-v3');
  const resume={root:'original',options:{directory_schema:'function-platform-v2',limit:2}};
  assert.equal(Options.resolve({defaults:{directory_schema:'function-platform-v3'},resume}).directory_schema,'function-platform-v2');
});

test('popup video batch uses this run skip count; single and resumed tasks retain their scope',()=>{
  const source=fs.readFileSync(require.resolve('../../source/extension/popup.js'),'utf8');
  const values={'#collection-mode':'video','#scope':'bulk','#batch-limit':'2','#skip-posts':'3','#trim-start':'0','#trim-end':'0','#comment-limit':'10','#task-destination':'','#video-action':'skip','#subtitle-mode':'audio'};
  const context=vm.createContext({
    q:selector=>({value:values[selector]??'0',checked:false}),
    defaults:{skip_posts:0,interval:1,limit:20,max_video_mb:512},
    resumeOptions:null,requestedPolicy:null,site:{site:'B站',parts:true},videoMode:'download',
    isVideo:()=>true,isAudio:()=>true,textModeComments:()=>false,Hub:{options:x=>x}
  });
  vm.runInContext(source.slice(source.indexOf('function options(){'),source.indexOf('async function start(')),context);
  let result=context.options();
  assert.equal(result.skip_posts,2);assert.equal(result.limit,2);assert.equal(result.output_format,'audio');
  assert.equal(result.capture_scope,'batch');assert.equal(context.defaults.skip_posts,0);
  values['#skip-posts']='1';assert.equal(context.options().skip_posts,0);
  values['#skip-posts']='0';assert.throws(()=>context.options(),/起始 P/);
  values['#skip-posts']='10';context.site.partCount=9;assert.throws(()=>context.options(),/超出/);
  context.site={site:'B站',parts:false,collection:true,collectionCount:28};
  values['#skip-posts']='24';assert.equal(context.options().skip_posts,23);
  values['#skip-posts']='1';assert.equal(context.options().skip_posts,0);
  values['#skip-posts']='0';assert.throws(()=>context.options(),/起始视频/);
  values['#skip-posts']='29';assert.throws(()=>context.options(),/超出/);
  values['#scope']='current';assert.equal(context.options().skip_posts,0);
  context.resumeOptions={skip_posts:7,limit:3};result=context.options();
  assert.equal(result.skip_posts,7);assert.equal(result.limit,3);assert.equal(result.resume,true);
});

test('defaults, matching mode, last and current draft have stable precedence',()=>{
  const defaults={limit:20,interval:5,destination:'default'};
  const result=Options.resolve({defaults,mode:'text',modePreferences:{text:{interval:2}},last:{kind:'text',options:{limit:40,destination:'old'}},draft:{tabId:1,expires:200,options:{limit:60,destination:'current'}},tabId:1,now:100});
  assert.deepEqual(result,{limit:60,interval:2,destination:'current'});
  assert.equal(Options.resolve({defaults,last:{options:{destination:'old'}}}).destination,null);
});
test('new default generation/signature invalidate old layers and wrong-tab expired draft',()=>{
  const old={limit:20},defaults={limit:40};
  const last=Options.stamp({limit:99},{defaults:old,generation:1});
  assert.equal(Options.resolve({defaults,last,generation:1}).limit,40);
  assert.equal(Options.resolve({defaults,last:{options:{limit:99}},generation:2}).limit,40);
  assert.equal(Options.resolve({defaults,draft:{tabId:2,expires:500,options:{limit:99}},tabId:1,now:100}).limit,40);
  assert.equal(Options.resolve({defaults,draft:{tabId:1,expires:50,options:{limit:99}},tabId:1,now:100}).limit,40);
});
test('resume snapshot ignores new defaults and is deeply frozen without mutating checkpoint',()=>{
  const resume={root:'original',options:{limit:2,nested:{name:'saved'}}};
  const result=Options.resolve({defaults:{limit:100},resume,generation:100});
  assert.equal(result.limit,2);assert.equal(result.destination,'original');assert.ok(Object.isFrozen(result.nested));
  resume.options.nested.name='changed';assert.equal(result.nested.name,'saved');
});

function client(responses){
  const calls=[],storage={collectorDefaultsGeneration:2},removed=[];
  const context=vm.createContext({AbortSignal,chrome:{storage:{local:{get:async()=>storage,set:async values=>Object.assign(storage,values),remove:async keys=>removed.push(...keys)}},runtime:{getManifest:()=>({version:'0.5.28'})}},fetch:async(url,options)=>{
    calls.push({url,options});const next=responses.shift();if(next instanceof Error)throw next;
    if(!next)throw new Error('unexpected request');return {ok:next.status<400,status:next.status,json:async()=>next.body};
  }});
  vm.runInContext(fs.readFileSync(require.resolve('../../source/extension/health-client.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(require.resolve('../../source/extension/hub-api.js'),'utf8')+';globalThis.client=Hub;',context);
  return {api:context.client.api,invalidateOptions:context.client.invalidateOptions,calls,storage,removed};
}
const health=token=>({status:200,body:{release:'0.5.28',settings_token:token}});
test('GET refreshes expired token once and uses new handshake token',async()=>{
  const c=client([health('old'),{status:403,body:{detail:'expired'}},health('new'),{status:200,body:{items:[]}}]);
  await c.api('/tasks?page=1');assert.equal(c.calls.length,4);assert.equal(c.calls[3].options.headers['X-Collector-Token'],'new');
});
test('POST retries only known before-execution auth failure, never network or arbitrary 403',async()=>{
  let c=client([health('old'),{status:403,body:{detail:'扩展未通过后台校验。reload'}},health('new'),{status:200,body:{ok:true}}]);
  await c.api('/collect',{});assert.equal(c.calls.length,4);
  c=client([health('old'),{status:403,body:{detail:'permission denied'}}]);
  await assert.rejects(c.api('/collect',{}),/permission denied/);assert.equal(c.calls.length,2);
  c=client([health('old'),new Error('network')]);
  await assert.rejects(c.api('/collect',{}),/连接不到/);assert.equal(c.calls.length,2);
});
test('second 403 fails without another refresh',async()=>{
  const c=client([health('old'),{status:403,body:{detail:'expired'}},health('new'),{status:403,body:{detail:'expired again'}}]);
  await assert.rejects(c.api('/tasks?page=1'),/expired again/);assert.equal(c.calls.length,4);
});
test('saving defaults advances generation and invalidates every new-task override including popup draft',async()=>{
  const c=client([]);await c.invalidateOptions();
  assert.equal(c.storage.collectorDefaultsGeneration,3);
  assert.deepEqual(c.removed,['collectorPopupDraft','collectorLastOptions','collectorModePreferences']);
});
