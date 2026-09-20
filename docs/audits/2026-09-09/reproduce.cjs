const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = process.cwd();
const nativeRequire = createRequire(path.join(root, 'package.json'));
const ts = nativeRequire('typescript');
const cache = new Map();
function execute(source, filename) {
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }}).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)((id) => {
    if (id === 'server-only') return {};
    if (id.startsWith('@/')) return load(path.join(root,id.slice(2)+'.ts'));
    if (id.startsWith('.')) return load(path.resolve(path.dirname(filename),id+'.ts'));
    return nativeRequire(id);
  },mod,mod.exports);
  return mod.exports;
}
function load(filename) {
  if (cache.has(filename)) return cache.get(filename);
  let source = fs.readFileSync(filename,'utf8');
  if (filename.endsWith('/lib/route-service.ts')) source += '\nexport { limitUniqueRoutes };';
  const result = execute(source,filename);cache.set(filename,result);return result;
}
const log = (label,data) => console.log(label, JSON.stringify(data));
for (const filename of ['app/api/fares/route.ts','app/api/best-options/route.ts','app/api/trip-input/select/route.ts']) {
  const src=fs.readFileSync(filename,'utf8');
  const ast=ts.createSourceFile(filename,src,ts.ScriptTarget.Latest,true);
  const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n) && n.name?.text==='getDepartureOptions');
  const {getDepartureOptions}=execute(fn.getText(ast)+'\nexport {getDepartureOptions};',filename);
  log('Stored Date schedule '+filename,getDepartureOptions({departureMode:'scheduled',scheduledAt:new Date('2026-09-10T03:00:00Z')}));
}
const trip=load(path.join(root,'lib/trip-input.ts'));
try {trip.validateTripInput(null);log('null validation','no exception');} catch(e) {log('null validation',{exception:e.name});}
log('Toronto accepted by US rectangular service area',trip.isInsideServiceArea({lat:43.6532,lng:-79.3832},'US'));
const loop={origin:{label:'A',lat:23.77,lng:90.41},destination:{label:'A',lat:23.77,lng:90.41},stops:[{label:'B',lat:23.8,lng:90.45,dwellMinutes:5}],passengerCount:1,departureMode:'now'};
log('Round trip A-B-A',trip.validateTripInput(loop));
const routeService=load(path.join(root,'lib/route-service.ts'));
const routes=[{id:'a',rank:1,distanceKm:5.1,durationMin:15,coords:[[23.7,90.4],[23.75,90.4]],legs:[]},{id:'b',rank:2,distanceKm:5.1,durationMin:15,coords:[[23.7,90.4],[23.73,90.44],[23.75,90.4]],legs:[]}];
log('Distinct geometries same rounded metrics',{input:routes.length,output:routeService.limitUniqueRoutes(routes).length});
const weather=load(path.join(root,'lib/weather.ts'));
const reading=weather.calculateWeatherSeverity({precipitationMmPerHour:30,windKmh:0,visibilityMeters:10000});
log('30 mm/hour rain model',{...reading,...weather.getWeatherVehicleRestriction({provider:'pathao',vehicleType:'bike'},reading)});
const score=load(path.join(root,'lib/route-scoring.ts'));
const option={provider:'uber',vehicleType:'go',displayName:'Example car',maxPassengers:4,comfortScore:4,eligible:true,weatherBlocked:false,weatherRestricted:false,restrictionReason:null,fare:{low:90,mid:100,high:110},fareSource:'rate_card',fareSourceNote:null,fareAdjustment:null};
log('Missing weather and traffic modeled as low',score.rankRouteOptions({options:[option],baseDurationMin:30,congestionLevel:'low',weatherBand:null}));
