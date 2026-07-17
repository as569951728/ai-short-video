import{describe,it}from"node:test";import assert from"node:assert/strict";import{execFileSync,spawnSync}from"node:child_process";import{createHash}from"node:crypto";import{chmodSync,mkdtempSync,mkdirSync,readFileSync,realpathSync,symlinkSync,unlinkSync,writeFileSync}from"node:fs";import{tmpdir}from"node:os";import{dirname,resolve}from"node:path";import{PACKAGE_DEFINITIONS,analyzePackageGate}from"./rp02b2a-package-gate.mjs";const ROOT=resolve("."),GATE_SCRIPT="scripts/rp02b2a-package-gate.mjs",WORKFLOW=resolve(".github/workflows/rp01c-fixtures.yml"),ADMISSION_WORKFLOW=resolve(".github/workflows/rp02b2a-admission.yml"),TRUSTED_WORKFLOW_ORACLE_SHA256="7063953e36a2b3e35bdbda7339719d10c6513fff900cd02d0c06d5c08dfba032",
BASELINE="501a3cfcdf12341d9f611f0fdd6a6336d4ade483",B2A2_BASELINE="6eaf60af4155a8b95ff77d53261f5896d3a8f77d",STALE_B2A2_BASELINE="4817abc67cf916772b317aff027403b97ab4df76",A1_ADR="docs/adr/rp-02b2a1-registry-abi-budget.md",GATE_PREP_ID="RP-02B2a2-G0",GATE_PREP_ADR="docs/adr/rp-02b2a2-gate-prep-budget.md",VERIFIED_GATE_PREP="verified-gate-prep";const GOVERNANCE_REMEDIATION_FILES=Object.freeze([".github/workflows/rp01a-e2e.yml",".github/workflows/rp01b-dom.yml",".github/workflows/rp01c-fixtures.yml",".github/workflows/remediation-governance.yml",".github/workflows/rp02b2a-admission.yml","apps/admin-web/src/modules/novels/components/TaskProgressPanel.dom.spec.ts","apps/api/test/rp01c/fixtureFactory.test.ts","docs/modules/rp-02b2-dispatcher-transport-implementation-package\
.md","docs/remediation/acceptance-matrix.md","docs/reviews/main-control-event-ledger.md","docs/reviews/main-control-status.md","docs/reviews/remediation-rmd-task-002-003-rp-02b2a1-verification-2026-07-15.md",GATE_SCRIPT,"scripts/rp02b2a-package-gate.test.mjs","package.json"]);const CLEAN_ENV="env -u DATABASE_URL -u DEEPSEEK_API_KEY -u DEEPSEEK_BASE_URL -u DEEPSEEK_MODEL -u DEEPSEEK_STRUCTURE_MODEL -u DEEPSEEK_REASONER_MODEL -u DEEPSEEK_TIMEOUT_MS -u DEEPSEEK_MAX_RETRIES -u DEPLOYMENT_ACTOR_TENANT_ID -u DEPLOYMENT_ACTOR_USER_ID NODE_ENV=production AI_PROVIDER_MODE=moc\
k DOTENV_CONFIG_PATH=/dev/null";const B2A2_SCRIPTS=Object.freeze({"test:rp02b2a2:env-probe":`node -e "const keys=['DATABASE_URL','DEEPSEEK_API_KEY','DEEPSEEK_BASE_URL','DEEPSEEK_MODEL','DEEPSEEK_STRUCTURE_MODEL','DEEPSEEK_REASONER_MODEL','DEEPSEEK_TIMEOUT_MS','DEEPSEEK_MAX_RETRIES','DEPLOYMENT_ACTOR_TENANT_ID','DEPLOYMENT_ACTOR_USER_ID']; if(keys.some((key)=>process.env[key]!==undefined)||process.env.NODE_ENV!=='production'||process.env.AI_PROVIDER_MODE!=='mock'||process.env.DOTENV_CONFIG_PATH!=='/dev/null') process.exit(1); console.log('RP02B2A2_ENV\
_CLEAN')"`,"test:rp02b2a2:core":`${CLEAN_ENV} sh -c 'npm run test:rp02b2a2:env-probe && npm run build -w @ai-shortvideo/shared && npm run prisma:generate -w @ai-shortvideo/api && npm exec -w @ai-shortvideo/api -- tsx --test test/rp02b2a/authority-claim.test.ts src/modules/novels/novelRoutes.test.ts'`,"test:rp02b2a2":`${CLEAN_ENV} sh -c 'npm run test:rp02b2a2:env-probe && npm run test:rp02b2a1 && npm run test:rp02b2a2:core'`});const BUSINESS_PACKAGE_SEQUENCE=Object.freeze(["RP-02B2a2","RP-02B2a3","RP-02B2a4","RP-02B2a5"]),BUSINESS_PREDECESSOR=Object.freeze({"RP-02B2a2":GATE_PREP_ID,"RP-02B2a3":"RP-02B2a2","RP-02B2a4":"RP-02B2a3","RP-02B2a5":"RP-02B2a4"}),BUSINESS_SCRIPT_ADDITIONS=Object.freeze({"RP-02B2a2":B2A2_SCRIPTS,"RP-02B2a3":Object.freeze({"test:rp02b2a3:core":`${CLEAN_ENV} sh -c 'npm run test:rp02b2a2:env-probe && npm exec -w @ai-shortvideo/api -- tsx --test test/rp02b2a/lease-dispatch-retry.test.ts'`,"test:rp02b2a3":`${CLEAN_ENV} sh -c 'npm run test:rp02b2a2:env-probe && npm run test:rp02b2a2 && npm run test:rp02b2a3:core'`}),"RP-02B2a4":Object.freeze({"test:rp02b2a4:core":`${CLEAN_ENV} sh -c 'npm run test:rp02b2a2:env-probe && npm exec -w @ai-shortvideo/api -- tsx --test test/rp02b2a/inmemory-fenced-finalize.test.ts src/modules/novels/novelRoutes.test.ts'`,"test:rp02b2a4":`${CLEAN_ENV} sh -c 'npm run test:rp02b2a2:env-probe && npm run test:rp02b2a3 && npm run test:rp02b2a4:core'`}),"RP-02B2a5":Object.freeze({"test:rp02b2a5:core":`${CLEAN_ENV} sh -c 'npm run test:rp02b2a2:env-probe && npm run prisma:generate -w @ai-shortvideo/api && npm exec -w @ai-shortvideo/api -- tsx --test test/rp02b2a/prisma-fenced-finalize.test.ts'`,"test:rp02b2a5":`${CLEAN_ENV} sh -c 'npm run test:rp02b2a2:env-probe && npm run test:rp02b2a4 && npm run test:rp02b2a5:core'`})});const COMMANDS=Object.freeze({"RP-02B2a1":"test:rp02b2a1",[GATE_PREP_ID]:"\
test:rp02b2a1:gate","RP-02B2a2":"test:rp02b2a2","RP-02B2a3":"test:rp02b2a3","RP-02B2a4":"test:rp02b2a4","RP-02B2a5":"test:rp02b2a5"});const RANGE_PACKAGES=Object.freeze(["RP-02B2a3","RP-02B2a4","RP-02B2a5"]);const ORACLE=Object.freeze({"RP-02B2a1":["RP-02B2a1-v1",A1_ADR,18,1900],[GATE_PREP_ID]:["RP-02B2a2-G0-v1",GATE_PREP_ADR,16,2e3],"RP-02B2a2":["RP-02B2a2-v1","docs/adr/rp-02b2a2-authority-claim-budget.md",18,1900],"RP-02B2a3":["RP-02B2a3-v1","docs/adr/rp-02b2a3-lease-retry-budget.md",14,1800],"\
RP-02B2a4":["RP-02B2a4-v1","docs/adr/rp-02b2a4-inmemory-finalize-budget.md",12,1900],"RP-02B2a5":["RP-02B2a5-v1","docs/adr/rp-02b2a5-prisma-nine-six-budget.md",10,1900]});const BASELINES=Object.freeze({"RP-02B2a1":BASELINE,[GATE_PREP_ID]:B2A2_BASELINE,"RP-02B2a2":VERIFIED_GATE_PREP,"RP-02B2a3":"range-base","RP-02B2a4":"range-base","RP-02B2a5":"range-base"});const REQUIRED_CATEGORIES=Object.freeze({"RP-02B2a1":Object.freeze(["production","test","adr"]),[GATE_PREP_ID]:Object.freeze(["governance","test","adr"]),"RP-02B2a2":Object.freeze(["production","test","adr"]),"RP-02B2a3":Object.freeze(["production","test","adr"]),"RP-02B2a4":Object.freeze(["production","test","adr"]),"RP-02B2a5":Object.freeze(["production","test","adr"])}),manifest=text=>Object.freeze(text.split("|").sort());const MANIFESTS=Object.freeze({"RP-02B2a1":manifest(".github/workflows/rp01c-fixtures.y\
ml|apps/api/src/modules/novels/novelRoutes.test.ts|apps/api/src/modules/novels/providers/deepseekNovelProvider.ts|apps/api/src/modules/novels/providers/mockBodyProvider.ts|apps/api/src/modules/novels/providers/mockDirectionProvider.ts|apps/api/src/modules/novels/providers/mockFullReviewProvider.ts|apps/api/src/modules/novels/providers/mockStructureProvider.ts|apps/api/src/modules/novels/providers/mockTrialProvider.ts|apps/api/src/modules/novels/services/actionExecutionPlan.ts|apps/api/src/module\
s/novels/services/novelService.ts|apps/api/src/modules/tasks/services/taskService.ts|apps/api/test/rp01c/fixtureFactory.test.ts|apps/api/test/rp02a/rp02a.test.ts|docs/adr/rp-02b2a1-registry-abi-budget.md|package.json|packages/shared/src/api.ts|packages/shared/src/novels.ts|scripts/rp02b2a-package-gate.mjs|scripts/rp02b2a-package-gate.test.mjs"),[GATE_PREP_ID]:manifest(`${GOVERNANCE_REMEDIATION_FILES.join("|")}|${GATE_PREP_ADR}`),"RP-02B2a2":manifest("packages/shared/src/api.ts|packages/shared/src/novels.ts|apps/api/src/co\
nfig/env.ts|apps/api/src/modules/novels/domain/executionContract.ts|apps/api/src/modules/novels/domain/novelDomain.ts|apps/api/src/modules/novels/services/actionExecutionPlan.ts|apps/api/src/modules/novels/services/taskClaim.ts|apps/api/src/modules/novels/services/novelService.ts|apps/api/src/modules/novels/routes/novelRoutes.ts|apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts|apps/api/src/modules/novels/repositories/prismaNovelRepository.ts|apps/api/src/app.ts|apps/api/src/ma\
in.ts|apps/api/test/rp02b2a/fixtures.ts|apps/api/test/rp02b2a/authority-claim.test.ts|apps/api/src/modules/novels/novelRoutes.test.ts|docs/adr/rp-02b2a2-authority-claim-budget.md|package.json"),"RP-02B2a3":manifest("packages/shared/src/api.ts|packages/shared/src/novels.ts|apps/api/src/modules/novels/domain/executionContract.ts|apps/api/src/modules/novels/domain/novelDomain.ts|apps/api/src/modules/novels/services/actionExecutionPlan.ts|apps/api/src/modules/novels/services/taskClaim.ts|apps/api/sr\
c/modules/tasks/services/taskService.ts|apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts|apps/api/src/modules/novels/repositories/prismaNovelRepository.ts|apps/api/src/modules/novels/novelRoutes.test.ts|apps/api/test/rp02b2a/fixtures.ts|apps/api/test/rp02b2a/lease-dispatch-retry.test.ts|docs/adr/rp-02b2a3-lease-retry-budget.md|package.json"),"RP-02B2a4":manifest("packages/shared/src/novels.ts|apps/api/src/modules/novels/domain/executionContract.ts|apps/api/src/modules/novels/d\
omain/novelDomain.ts|apps/api/src/modules/novels/services/actionExecutionPlan.ts|apps/api/src/modules/novels/services/taskClaim.ts|apps/api/src/modules/novels/services/novelService.ts|apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts|apps/api/test/rp02b2a/fixtures.ts|apps/api/test/rp02b2a/inmemory-fenced-finalize.test.ts|apps/api/src/modules/novels/novelRoutes.test.ts|docs/adr/rp-02b2a4-inmemory-finalize-budget.md|package.json"),"RP-02B2a5":manifest("apps/api/src/modules/novels\
/domain/executionContract.ts|apps/api/src/modules/novels/domain/novelDomain.ts|apps/api/src/modules/novels/services/actionExecutionPlan.ts|apps/api/src/modules/novels/services/taskClaim.ts|apps/api/src/modules/novels/repositories/prismaNovelRepository.ts|apps/api/src/modules/novels/novelRoutes.test.ts|apps/api/test/rp02b2a/fixtures.ts|apps/api/test/rp02b2a/prisma-fenced-finalize.test.ts|docs/adr/rp-02b2a5-prisma-nine-six-budget.md|package.json")});const A1_FILES=["apps/api/src/modules/novels/ser\
vices/actionExecutionPlan.ts","apps/api/test/rp02a/rp02a.test.ts",A1_ADR],EXCLUSIVE=Object.freeze({"RP-02B2a1":"apps/api/src/modules/novels/providers/mockDirectionProvider.ts",[GATE_PREP_ID]:GATE_SCRIPT,"RP-02B2a2":"apps/api/src/app.ts","RP-02B2a3":"apps/api/test/rp02b2a/lease-dispatch-retry.test.ts","RP-02B2a4":"apps/api/src/modules/novels/repositories/inMemoryNovelRepository.ts","RP-02B2a5":"apps/api/src/modules/novels/repositories/prismaNovelRepository.ts"});function sh(cwd,args,options={}){return execFileSync(args[0],
args.slice(1),{cwd,encoding:"utf8",...options})}function write(repo2,file,content){mkdirSync(dirname(resolve(repo2,file)),{recursive:true});writeFileSync(resolve(repo2,file),content)}function commit(repo2,message){sh(repo2,["git","add","-A"]);sh(repo2,["git","commit","-q","-m",message]);return sh(repo2,["git","rev-parse","HEAD"]).trim()}function repo(fixed=false){const path=mkdtempSync(resolve(tmpdir(),"rp02b2a-gate-")),fixedSha=fixed===true?BASELINE:fixed||void 0;if(fixedSha)sh(tmpdir(),["git",
"clone","-q","--shared","--no-checkout",ROOT,path]);else sh(path,["git","init","-q"]);sh(path,["git","config","user.email","rp02b2a@example.test"]);sh(path,["git","config","user.name","RP02B2a Gate"]);if(fixedSha){sh(path,["git","checkout","-q","--detach",fixedSha]);write(path,GATE_SCRIPT,readFileSync(resolve(ROOT,GATE_SCRIPT)))}else{write(path,"README.md","base\n");write(path,GATE_SCRIPT,readFileSync(resolve(ROOT,GATE_SCRIPT)));commit(path,"base")}return path}function stats(repoPath,base){sh(repoPath,
["git","add","-N","--","."]);let added=0,deleted=0,files=0;for(const line of sh(repoPath,["git","diff","--text","--numstat",base]).split("\n").filter(Boolean)){const[a,d]=line.split("	",2);added+=Number(a);deleted+=Number(d);files+=1}return{files,net:Math.max(0,added-deleted)}}function adr(values){return`${Object.entries(values).map(([key,value])=>`${key}: ${value}`).join("\n")}
`}function select(packageId){const all=MANIFESTS[packageId];if(packageId===GATE_PREP_ID)return[...all];const production=packageId==="RP-02B2a1"?A1_FILES[0]:category(EXCLUSIVE[packageId])==="production"?EXCLUSIVE[packageId]:all.find(file=>category(file)==="production"),test=BUSINESS_PACKAGE_SEQUENCE.includes(packageId)?all.find(file=>file.startsWith("apps/api/test/rp02b2a/")&&file.endsWith(".test.ts")):all.find(file=>category(file)==="test");return[production,test,ORACLE[packageId][1]]}function category(file){if(file.startsWith("docs/adr/"))return"adr";if(file.includes(".test.")||file.includes("/test/")||file.endsWith("novelRoutes.test.ts"))return"test";if(file.startsWith("scripts/")||file.startsWith(
".github/"))return"governance";return"production"}function writeBusinessPackageJson(repoPath,packageId,mutate2=scripts=>scripts){const packageJson=JSON.parse(readFileSync(resolve(repoPath,"package.json"),"utf8")),additions=BUSINESS_SCRIPT_ADDITIONS[packageId];packageJson.scripts={...packageJson.scripts,...mutate2({...additions})};write(repoPath,"package.json",`${JSON.stringify(packageJson,null,2)}
`)}function writeB2a2PackageJson(repoPath,mutate2=scripts=>scripts){writeBusinessPackageJson(repoPath,"RP-02B2a2",mutate2)}function prepare(packageId="RP-02B2a1",files,options={}){const[manifestId,defaultAdr,hardMaxFiles,hardMaxNetAdditions]=ORACLE[packageId];let path;let base;let gateSource;let g0EvidenceSha;if(BUSINESS_PACKAGE_SEQUENCE.includes(packageId)){const predecessor=prepare(BUSINESS_PREDECESSOR[packageId]);path=predecessor.repo;base=predecessor.head;gateSource=predecessor.gateSource??(BUSINESS_PREDECESSOR[packageId]===GATE_PREP_ID?predecessor.head:void 0);g0EvidenceSha=predecessor.g0EvidenceSha;if(predecessor.packageId===GATE_PREP_ID){g0EvidenceSha=publishEvidence(predecessor).head;sh(path,["git","checkout","-q","--detach",predecessor.head])}}else{const fixed=BASELINES[packageId]==="range-base"?false:BASELINES[packageId];path=repo(fixed);base=sh(path,["git","rev-parse","HEAD"]).trim()}const chosen=files??select(packageId);for(const file of chosen.filter(item=>!item.startsWith("\
docs/adr/"))){if(packageId===GATE_PREP_ID&&GOVERNANCE_REMEDIATION_FILES.includes(file))copyGatePrepFile(path,file);else if(file===GATE_SCRIPT)write(path,file,readFileSync(resolve(ROOT,file)));else write(path,file,`${file}
`)}if(BUSINESS_PACKAGE_SEQUENCE.includes(packageId))writeBusinessPackageJson(path,packageId,options.mutateScripts);if(options.includeAdr!==false){const adrPath=options.adrPath??defaultAdr,render=(filesCount,net)=>adr({status:"ready",package_id:packageId,manifest_id:manifestId,baseline_sha:["range-base",VERIFIED_GATE_PREP].includes(BASELINES[packageId])?base:BASELINES[packageId],hard_max_files:hardMaxFiles,hard_max_net_additions:hardMaxNetAdditions,actual_files:filesCount,actual_net_additions:net,...options.overrides});write(path,adrPath,
render(0,0));const actual=stats(path,base);write(path,adrPath,render(actual.files,actual.net))}return{repo:path,base,head:commit(path,packageId),packageId,gateSource:gateSource??options.gateSource,g0EvidenceSha:g0EvidenceSha??options.g0EvidenceSha,authorizedPredecessorSha:base}}function changedBusinessPackage(item){const changed=new Set(sh(item.repo,["git","diff","--name-only",item.base,item.head]).split(/\r?\n/).filter(Boolean));return BUSINESS_PACKAGE_SEQUENCE.find(id=>changed.has(ORACLE[id][1]))}function authorizedArgs(item){const packageId=item.authorizedPackageId??changedBusinessPackage(item);return packageId?["--gate-source",item.gateSource??"","--g0-evidence-sha",item.g0EvidenceSha??"","--authorized-package-id",packageId,"--authorized-predecessor-sha",item.authorizedPredecessorSha??item.base]:[]}function gate(item){return spawnSync(process.execPath,[realpathSync(resolve(item.repo,GATE_SCRIPT)),"--base",item.base,"--head",item.head,...authorizedArgs(item)],{cwd:item.repo,encoding:"utf8"})}function run(repoPath,args,env){return spawnSync(process.execPath,[realpathSync(resolve(repoPath,GATE_SCRIPT)),...args],{cwd:repoPath,encoding:"utf8",env:env&&{...process.env,...env}})}function githubOutput(item){return run(item.repo,["--github-output","--base",item.base,"--head",item.head,...authorizedArgs(item)])}function authoritativeGate(item,{eventBase=item.base,eventHead=item.head,gateSource=item.gateSource,g0EvidenceSha=item.g0EvidenceSha,authorizedPackageId=item.authorizedPackageId??changedBusinessPackage(item),authorizedPredecessorSha=item.authorizedPredecessorSha??item.base,extra=[]}={}){const authorization=authorizedPackageId===void 0?[]:["--gate-source",gateSource??"","--g0-evidence-sha",g0EvidenceSha??"","--authorized-package-id",authorizedPackageId,"--authorized-predecessor-sha",authorizedPredecessorSha??""];return run(item.repo,["--github-output","--event","pull_request_target","--event-base",eventBase,"--event-head",eventHead,...authorization,...extra])}
const invokePackageGate=gate;gate=item=>{const packageId=changedBusinessPackage(item);return invokePackageGate(packageId==="RP-02B2a2"&&!item.gateSource?{...item,gateSource:item.base,authorizedPackageId:packageId,authorizedPredecessorSha:item.base}:item)};
function trustedCheckoutGate(item) {
  const trusted = mkdtempSync(resolve(tmpdir(), "rp02b2a-trusted-checkout-"));
  sh(tmpdir(), ["git", "clone", "-q", "--shared", "--no-checkout", item.repo, trusted]);
  sh(trusted, ["git", "checkout", "-q", "--detach", item.gateSource]);
  return run(trusted, ["--github-output", "--event", "pull_request_target", "--event-base", item.base, "--event-head", item.head, "--gate-source", item.gateSource, "--g0-evidence-sha", item.g0EvidenceSha, "--authorized-package-id", item.packageId, "--authorized-predecessor-sha", item.authorizedPredecessorSha]);
}
function expectedManifestDigest(item) {
  const [manifestId, adrPath, hardMaxFiles, hardMaxNetAdditions] = ORACLE[item.packageId];
  const manifest = MANIFESTS[item.packageId].map((path) => {
    const entry = sh(item.repo, ["git", "ls-tree", item.head, "--", path]).trim();
    if (!entry) return { path, state: "missing" };
    const [metadata] = entry.split("\t"), [mode, type, object] = metadata.split(" ");
    assert.equal(type, "blob", path);
    return { path, mode, object };
  });
  return createHash("sha256").update(JSON.stringify({ policy_version: "RP-02B2a-trusted-admission-v2", package_id: item.packageId, manifest_id: manifestId, adr_path: adrPath, test_command: COMMANDS[item.packageId], hard_max_files: hardMaxFiles, hard_max_net_additions: hardMaxNetAdditions, baseline_policy: BASELINES[item.packageId], required_categories: [...REQUIRED_CATEGORIES[item.packageId]].sort(), base_sha: item.base, candidate_sha: item.head, manifest })).digest("hex");
}
const GATE_PREP_SCRIPT_NAMES=Object.freeze(["test:rp02b2a1:env-probe","test:rp02b2a1:gate","test:rp02b2a1:core","test:rp02b2a1"]);
function gatePrepPackageJson(sourcePackageJson=JSON.parse(readFileSync(resolve(ROOT,"package.json"),"utf8"))){const baselinePackageJson=JSON.parse(sh(ROOT,["git","show",`${B2A2_BASELINE}:package.json`]));baselinePackageJson.scripts={...baselinePackageJson.scripts,...Object.fromEntries(GATE_PREP_SCRIPT_NAMES.map(name=>[name,sourcePackageJson.scripts?.[name]]))};return`${JSON.stringify(baselinePackageJson,null,2)}\n`}
function copyGatePrepFile(repoPath,file,sourcePackageJson){write(repoPath,file,file==="package.json"?gatePrepPackageJson(sourcePackageJson):readFileSync(resolve(ROOT,file)))}
it("freezes temporary gate-prep package scripts when the outer candidate contains A2 scripts",()=>{const sourcePackageJson=JSON.parse(readFileSync(resolve(ROOT,"package.json"),"utf8"));sourcePackageJson.scripts={...sourcePackageJson.scripts,...B2A2_SCRIPTS};const frozen=JSON.parse(gatePrepPackageJson(sourcePackageJson));for(const name of Object.keys(B2A2_SCRIPTS))assert.equal(frozen.scripts[name],void 0);for(const name of GATE_PREP_SCRIPT_NAMES)assert.equal(frozen.scripts[name],sourcePackageJson.scripts[name])});
function copyCurrentFiles(repoPath,files){for(const file of files)copyGatePrepFile(repoPath,file)}function addMinimalB2a2Candidate(repoPath,base){const[,adrPath,hardMaxFiles,hardMaxNetAdditions]=ORACLE["RP-02B2a2"];for(const file of select("RP-02B2a2").filter(item=>item!==adrPath))write(repoPath,file,`${file}
`);writeB2a2PackageJson(repoPath);const render=(files,net)=>adr({status:"ready",package_id:"RP-02B2a2",manifest_id:"RP-02B2a2-v1",baseline_sha:base,hard_max_files:hardMaxFiles,hard_max_net_additions:hardMaxNetAdditions,actual_files:files,actual_net_additions:net});write(repoPath,adrPath,render(0,0));const actual=stats(repoPath,base);write(repoPath,adrPath,render(actual.files,actual.net));return commit(repoPath,"minimal B2a2 candidate after governance remediation")}function createB2a2CommandHarness(item){
const packageJson=JSON.parse(sh(item.repo,["git","show",`${item.head}:package.json`])),scripts=packageJson.scripts,directory=mkdtempSync(resolve(tmpdir(),"rp02b2a2-command-")),shim=resolve(directory,"npm-shim.mjs"),npm=resolve(directory,"npm"),log=resolve(directory,"stages.log"),canary="RP02B2A2_ENV_CANARY",canaries=Object.fromEntries(["DATABASE_URL","DEEPSEEK_API_KEY","DEEPSEEK_BASE_URL","DEEPSEEK_MODEL","DEEPSEEK_STRUCTURE_MODEL","DEEPSEEK_REASONER_MODEL","DEEPSEEK_TIMEOUT_MS","DEEPSEEK_MAX_RE\
TRIES","DEPLOYMENT_ACTOR_TENANT_ID","DEPLOYMENT_ACTOR_USER_ID"].map(key=>[key,canary]));writeFileSync(shim,`#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const record = (stage) => appendFileSync(process.env.RP02B2A2_STAGE_LOG, stage + "\\n");
const fail = (stage) => {
  if (process.env.RP02B2A2_FAIL_STAGE === stage) process.exit(17);
};
if (args[0] === "run" && ["test:rp02b2a2:env-probe", "test:rp02b2a2:core"].includes(args[1])) {
  const stage = args[1].endsWith(":core") ? "core" : "env-probe";
  record(stage);
  fail(stage);
  const packageJson = JSON.parse(readFileSync(process.env.RP02B2A2_PACKAGE_JSON, "utf8"));
  const child = spawnSync("/bin/sh", ["-c", packageJson.scripts[args[1]]], {
    env: process.env,
    stdio: "inherit",
  });
  process.exit(child.status ?? 1);
}
let stage;
if (args[0] === "run" && args[1] === "test:rp02b2a1") stage = "predecessor";
else if (args[0] === "run" && args[1] === "build") stage = "build";
else if (args[0] === "run" && args[1] === "prisma:generate") stage = "prisma";
else if (args[0] === "exec" && args.includes("--test")) stage = "tests";
else stage = "unexpected:" + args.join(" ");
record(stage);
fail(stage);
process.exit(stage.startsWith("unexpected:") ? 64 : 0);
`);chmodSync(shim,493);symlinkSync(shim,npm);const runScript=(name,failStage)=>{writeFileSync(log,"");const result=spawnSync("/bin/sh",["-c",scripts[name]],{cwd:item.repo,encoding:"utf8",env:{...process.env,...canaries,RP02B2A2_ENV_CANARY:canary,RP02B2A2_FAIL_STAGE:failStage??"",RP02B2A2_PACKAGE_JSON:resolve(item.repo,"package.json"),RP02B2A2_STAGE_LOG:log,PATH:`${directory}:${process.env.PATH}`}});const stages=readFileSync(log,"utf8").split("\n").filter(Boolean);return{...result,stages}};return{
canary,runScript}}function workflow(path=WORKFLOW,args=[]){return run(ROOT,["--verify-workflow",path,...args])}function trustedWorkflow(){return run(ROOT,["--verify-admission-workflow",".github/workflows/rp02b2a-admission.yml"])}function mutateTrustedWorkflow(change,label="trusted workflow mutation must change fixture"){const path=repo(),original=readFileSync(ADMISSION_WORKFLOW,"utf8"),changed=change(original);assert.notEqual(changed,original,label);write(path,".github/workflows/rp02b2a-admission.yml",changed);return run(path,["--verify-admission-workflow",".github/workflows/rp02b2a-admission.yml"])}function mutate(change,label="workflow mutation must change fixture"){const path=resolve(mkdtempSync(resolve(tmpdir(),"rp02b2a-yaml-")),"workflow.yml");const original=readFileSync(WORKFLOW,"utf8");const changed=change(original);assert.notEqual(changed,original,label);writeFileSync(path,changed);return workflow(path)}function aliasPaths(text,name="gate_paths"){return text.replace("      base_sha:\n        description: Explicit base SHA for package gate\n        required: true\n      head_sha:\n        description: Explicit head SHA for package gate\n        required: true",`      base_sha: &gate_paths\n        description: Explicit base SHA for package gate\n        required: true\n      head_sha: *${name}`)}function expectRejected(result,pattern,message){const context=message??`${result.stdout}\n${result.stderr}`;assert.ok(Number.isInteger(result.status)&&result.status!==0,context);assert.equal(result.signal,null,context);assert.match(result.stderr,pattern,message)}function fail(overrides,pattern){expectRejected(gate(prepare("RP-02B2a1",A1_FILES,{overrides})),pattern)}function addPackage(repoPath,packageId,base,{status="ready",includeAdr=true}={}){const[manifestId,adrPath,hardMaxFiles,hardMaxNetAdditions]=ORACLE[packageId],files=select(packageId),render=(count,net)=>adr({status,package_id:packageId,manifest_id:manifestId,baseline_sha:["range-base",VERIFIED_GATE_PREP].includes(BASELINES[packageId])?base:BASELINES[packageId],hard_max_files:hardMaxFiles,hard_max_net_additions:hardMaxNetAdditions,actual_files:count,actual_net_additions:net});
for(const file of files.filter(item=>item!==adrPath)){if(GOVERNANCE_REMEDIATION_FILES.includes(file))write(repoPath,file,readFileSync(resolve(ROOT,file)));else write(repoPath,file,file===EXCLUSIVE[packageId]?`${packageId}:${file}\\n`:`${file}\\n`)}if(BUSINESS_PACKAGE_SEQUENCE.includes(packageId))writeBusinessPackageJson(repoPath,packageId);if(includeAdr){write(repoPath,adrPath,render(0,0));const actual=stats(repoPath,base);write(repoPath,adrPath,render(actual.files,actual.net))}else try{unlinkSync(resolve(repoPath,adrPath))}catch(error){if(error?.code!=="ENOENT")throw error}return commit(repoPath,`${packageId} ${status}`)}function damagePackage(repoPath,packageId,mode){const adrPath=ORACLE[packageId][1];write(repoPath,EXCLUSIVE[packageId],`${packageId} ${mode}
`);if(mode==="missing")unlinkSync(resolve(repoPath,adrPath));else write(repoPath,adrPath,readFileSync(resolve(repoPath,adrPath),"utf8").replace("status: ready",`status: ${mode}`));return commit(repoPath,`${packageId} ${mode}`)}function forceBefore(repoPath,landed,head){sh(repoPath,["git","checkout","-q","--detach",landed]);sh(repoPath,["git","commit","-q","--allow-empty","-m","unreachable force before"]);const before=sh(repoPath,["git","rev-parse","HEAD"]).trim();sh(repoPath,["git","checkout","-\
q","--detach",head]);return before}function pushRange(repoPath,baseRef,before,head){return run(repoPath,["--print-range","--event","push","--push-base-ref",baseRef,"--push-before",before,"--push-head",head])}function assertOracle(definitions){for(const[id,tuple]of Object.entries(ORACLE)){const def=definitions[id];assert.deepEqual([def.manifestId,def.adrPath,def.hardMaxFiles,def.hardMaxNetAdditions,def.testCommand,def.baselinePolicy],[...tuple,COMMANDS[id],BASELINES[id]]);assert.deepEqual([...def.
manifest].sort(),MANIFESTS[id]);assert.deepEqual([...def.requiredCategories].sort(),[...REQUIRED_CATEGORIES[id]].sort())}}describe("RP-02B2a package gate production script",()=>{it("passes through the production script in a fixed-baseline temporary repo",()=>{const result=gate(prepare());assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/package gate passed/)});it("matches the independent frozen package oracle",()=>assertOracle(PACKAGE_DEFINITIONS));it("rejects non-script package drift and contaminated G0 ancestry",()=>{const mutateMetadata=item=>{const packageJson=JSON.parse(readFileSync(resolve(item.repo,"package.json"),"utf8"));packageJson.version=`${packageJson.version}-tampered`;write(item.repo,"package.json",`${JSON.stringify(packageJson,null,2)}\n`);item.head=commit(item.repo,"tamper package metadata");return item};const gatePrep=mutateMetadata(prepare(GATE_PREP_ID));expectRejected(gate(gatePrep),/cannot modify non-script package\.json fields/);const contaminatedBase=gatePrep.head,candidate=addMinimalB2a2Candidate(gatePrep.repo,contaminatedBase);expectRejected(gate({repo:gatePrep.repo,base:contaminatedBase,head:candidate}),/must branch directly from the accepted G0 code head|must be one atomic direct child commit/);const a2=mutateMetadata(prepare("RP-02B2a2"));expectRejected(gate(a2),/cannot modify non-script package\.json fields/)});it("detects every A1-A5 allowlist and baseline-policy mutation",()=>{for(const id of Object.keys(ORACLE)){const def2=PACKAGE_DEFINITIONS[id];
assert.throws(()=>assertOracle({...PACKAGE_DEFINITIONS,[id]:{...def2,manifest:new Set([...def2.manifest,`outside/${id}.ts`])}}));assert.throws(()=>assertOracle({...PACKAGE_DEFINITIONS,[id]:{...def2,baselinePolicy:"self-reported"}}))}const def=PACKAGE_DEFINITIONS["RP-02B2a1"],manifest2=new Set(def.manifest);manifest2.delete("packages/shared/src/novels.ts");manifest2.add("apps/api/src/modules/novels/providers/deepseekNovelProvider.test.ts");assert.throws(()=>assertOracle({...PACKAGE_DEFINITIONS,"R\
P-02B2a1":{...def,manifest:manifest2}}))});it("clears external env canaries through gate, core, and composite prefixes",()=>{const scripts=JSON.parse(readFileSync(resolve("package.json"),"utf8")).scripts,canaries=Object.fromEntries(["DATABASE_URL","DEEPSEEK_API_KEY","DEEPSEEK_BASE_URL","DEEPSEEK_MODEL","DEEPSEEK_STRUCTURE_MODEL","DEEPSEEK_REASONER_MODEL","DEEPSEEK_TIMEOUT_MS","DEEPSEEK_MAX_RETRIES","DEPLOYMENT_ACTOR_TENANT_ID","DEPLOYMENT_ACTOR_USER_ID"].map(key=>[key,"leak"]));for(const name of["test:rp02b2a1:gate","test:rp02b2a1:core","test:rp02b2a\
1"]){const[prefix]=scripts[name].split(" sh -c "),child=spawnSync("sh",["-c",`${prefix} npm run test:rp02b2a1:env-probe`],{cwd:ROOT,encoding:"utf8",env:{...process.env,...canaries}});assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/RP02B2A_ENV_CLEAN/)}});it("live-spawns the committed A2 probe, core, and composite with env isolation and fail-fast ordering",()=>{const item=prepare("RP-02B2a2"),harness=createB2a2CommandHarness(item),directProbe=harness.runScript("test:rp02b2a2:e\
nv-probe");assert.notEqual(directProbe.status,0);assert.deepEqual(directProbe.stages,[]);for(const[name,expectedStages]of[["test:rp02b2a2:core",["env-probe","build","prisma","tests"]],["test:rp02b2a2",["env-probe","predecessor","core","env-probe","build","prisma","tests"]]]){const passed=harness.runScript(name);assert.equal(passed.status,0,passed.stderr);assert.deepEqual(passed.stages,expectedStages);assert.match(passed.stdout,/RP02B2A2_ENV_CLEAN/);assert.doesNotMatch(`${passed.stdout}
${passed.stderr}`,new RegExp(harness.canary))}for(const[failedStage,expectedStages]of[["predecessor",["env-probe","predecessor"]],["build",["env-probe","predecessor","core","env-probe","build"]],["prisma",["env-probe","predecessor","core","env-probe","build","prisma"]]]){const failed=harness.runScript("test:rp02b2a2",failedStage);assert.equal(failed.status,17,`${failedStage}: ${failed.stderr}`);assert.deepEqual(failed.stages,expectedStages,`${failedStage} failure must stop before every downstream stage`)}});it("executes the gate script committed in the candidate HEAD",()=>{const path=repo(),base=sh(path,["git","rev-parse","HEAD"]).trim(),marker="CANDIDATE_HEAD_GATE_EXECUTED";write(path,GATE_SCRIPT,`console.error(${JSON.stringify(marker)}); process.exitCode = 23;
`);const result=gate({repo:path,base,head:commit(path,"candidate-owned gate script")});assert.equal(result.status,23);expectRejected(result,new RegExp(marker))});it("fails closed for ADR field and category drift",()=>{for(const[overrides,pattern]of[[{status:"draft"},/status mismatch/],[{package_id:"RP-02B2a2"},/package_id mismatch/],[{manifest_id:"wrong"},/manifest_id mismatch/],[{baseline_sha:"1".repeat(40)},/baseline_sha mismatch/],[{actual_files:2},/actual_files mismatch/],[{actual_net_additions:3},
/actual_net_additions mismatch/]])fail(overrides,pattern);const path=repo(true);write(path,A1_ADR,adr({status:"ready",package_id:"RP-02B2a1",manifest_id:"RP-02B2a1-v1",baseline_sha:BASELINE,hard_max_files:18,hard_max_net_additions:1900,actual_files:1,actual_net_additions:0}));expectRejected(gate({repo:path,base:BASELINE,head:commit(path,"adr only")}),/missing required production/)});it("fixes A1 and gate-prep baselines, binds B2a2 to verified G0, and keeps A3-A5 range-bound",()=>{const path=repo(),
base=sh(path,["git","rev-parse","HEAD"]).trim();write(path,A1_FILES[0],"production\n");write(path,A1_FILES[1],"test\n");write(path,A1_ADR,adr({status:"ready",package_id:"RP-02B2a1",manifest_id:"RP-02B2a1-v1",baseline_sha:base,hard_max_files:18,hard_max_net_additions:1900,actual_files:3,actual_net_additions:11}));expectRejected(gate({repo:path,base,head:commit(path,"random A1")}),/requires fixed baseline/);const b2a2=prepare("RP-02B2a2");assert.notEqual(b2a2.base,B2A2_BASELINE);assert.equal(
sh(b2a2.repo,["git","rev-parse",`${b2a2.base}^`]).trim(),B2A2_BASELINE);assert.equal(gate(b2a2).status,0);expectRejected(gate({...b2a2,base:B2A2_BASELINE}),/requires exactly one changed ADR, got 2/);for(const id of RANGE_PACKAGES){const item=prepare(id),result=gate(item);assert.notEqual(item.base,BASELINE);assert.equal(result.status,0,`${id}: ${result.stderr}`);expectRejected(gate(prepare(id,void 0,{overrides:{baseline_sha:"f".repeat(40)}})),/baseline_sha mismatch/)}});it("requires the\
 candidate HEAD B2a2 env-probe, core, and composite commands",()=>{const valid=prepare("RP-02B2a2"),passed=gate(valid);assert.equal(passed.status,0,passed.stderr);writeB2a2PackageJson(valid.repo,scripts=>({...scripts,"test:rp02b2a2":"true"}));assert.equal(gate(valid).status,0,"the gate must read the committed candidate HEAD, not the dirty worktree");const cases=[scripts=>({...scripts,"test:rp02b2a2:env-probe":"true"}),scripts=>({...scripts,"test:rp02b2a2:core":`${CLEAN_ENV} sh -c ''`}),scripts=>({
...scripts,"test:rp02b2a2:core":`${scripts["test:rp02b2a2:core"]} || true`}),scripts=>({...scripts,"test:rp02b2a2:core":scripts["test:rp02b2a2:core"].replace("env -u DATABASE_URL ","env ")}),scripts=>({...scripts,"test:rp02b2a2:core":scripts["test:rp02b2a2:core"].replace("-u DEPLOYMENT_ACTOR_TENANT_ID ","")}),scripts=>({...scripts,"test:rp02b2a2:core":scripts["test:rp02b2a2:core"].replace("env-probe && npm run build","env-probe; npm run build")}),scripts=>({...scripts,"test:rp02b2a2:core":scripts["test:rp02b2a2:core"].replace("npm run build -w @ai-shortvideo/shared && npm run prisma:generate","npm run build -w @ai-shortvideo/shared; npm run prisma:generate")}),scripts=>({...scripts,"test:rp02b2a2:core":scripts["test:rp02b2a2:core"].replace("test/rp02b2a/authority-claim.test.ts ","")}),scripts=>({...scripts,"test:rp02b2a2:core":scripts["\
test:rp02b2a2:core"].replace(" src/modules/novels/novelRoutes.test.ts","")}),scripts=>({...scripts,"test:rp02b2a2":scripts["test:rp02b2a2"].replace("npm run test:rp02b2a1 && ","")}),scripts=>({...scripts,"test:rp02b2a2":scripts["test:rp02b2a2"].replace("env-probe && npm run test:rp02b2a1","env-probe; npm run test:rp02b2a1")})];for(const mutateScripts of cases)expectRejected(gate(prepare("RP-02B2a2",void 0,{mutateScripts})),/script test:rp02b2a2.*env-clean fail-fast contract/)});it("keeps the documented A2 exact scripts aligned with the production gate",()=>{const document=readFileSync(resolve("docs/modules/rp-02b2-dispatcher-transport-implementation-package.md"),"utf8"),block=/B2a2 在 `package\.json`[\s\S]*?```json\n([\s\S]*?)\n```/.exec(document);assert.ok(block,"missing documented B2a2 JSON script contract");assert.deepEqual(JSON.parse(block[1]),B2A2_SCRIPTS)});it("rejects inherited script rewrites and root lifecycle hooks",()=>{expectRejected(gate(prepare("RP-02B2a2",void 0,{mutateScripts:scripts=>({...scripts,"test:rp02b2a1":"true"})})),/cannot rewrite inherited package\.json script test:rp02b2a1/);for(const lifecycle of["preinstall","install","postinstall","prepare"])expectRejected(gate(prepare("RP-02B2a2",void 0,{mutateScripts:scripts=>({...scripts,[lifecycle]:"true"})})),new RegExp(`rejects root npm lifecycle script ${lifecycle}`))});it("freezes gate-prep A1 actor-clean scripts and all other inherited scripts",()=>{const reject=mutate=>{const item=prepare(GATE_PREP_ID),packageJson=JSON.parse(readFileSync(resolve(item.repo,"package.json"),"utf8"));packageJson.scripts=mutate({...packageJson.scripts});write(item.repo,"package.json",`${JSON.stringify(packageJson,null,2)}\n`);item.head=commit(item.repo,"invalid gate-prep package scripts");return gate(item)};for(const mutate of[scripts=>({...scripts,"test:rp02b2a1:env-probe":scripts["test:rp02b2a1:env-probe"].replace(",\'DEPLOYMENT_ACTOR_USER_ID\'","")}),scripts=>({...scripts,"test:rp02b2a1:gate":scripts["test:rp02b2a1:gate"].replace("-u DEPLOYMENT_ACTOR_TENANT_ID ","")}),scripts=>({...scripts,"test:rp02b2a1:core":"true"}),scripts=>({...scripts,"test:governance":"true"}),scripts=>({...scripts,"test:unapproved":"true"}),scripts=>({...scripts,prepare:"true"})])expectRejected(reject(mutate),/cannot rewrite inherited package\.json script|cannot add package\.json script|rejects root npm lifecycle script|does not match the actor-clean contract/)});it("rejects the obsolete 15-file A2 template when it becomes a candidate contract",()=>expectRejected(gate(prepare("RP-02B2a2",void 0,{overrides:{hard_max_files:15}})),/hard_max_files mismatch/));it("admits t\
he current governance remediation only through the separately owned gate-prep package",()=>{const path=repo(B2A2_BASELINE);copyCurrentFiles(path,GOVERNANCE_REMEDIATION_FILES);const render=(files,net)=>adr({status:"ready",package_id:GATE_PREP_ID,manifest_id:"RP-02B2a2-G0-v1",baseline_sha:B2A2_BASELINE,hard_max_files:16,hard_max_net_additions:2e3,actual_files:files,actual_net_additions:net});write(path,GATE_PREP_ADR,render(0,0));const actual=stats(path,B2A2_BASELINE);write(path,GATE_PREP_ADR,render(
actual.files,actual.net));const head=commit(path,"governance remediation gate-prep package"),result=gate({repo:path,base:B2A2_BASELINE,head});assert.equal(result.status,0,`${result.stdout}
${result.stderr}`);assert.match(result.stdout,/RP-02B2a2-G0 package gate passed/)});it("binds governance remediation plus a minimal B2a2 candidate to the verified gate-prep commit",()=>{const item=prepare("RP-02B2a2"),result=gate(item);assert.equal(result.status,0,`${result.stdout}
${result.stderr}`);assert.match(result.stdout,/RP-02B2a2 package gate passed/);expectRejected(gate({...item,base:B2A2_BASELINE}),/requires exactly one changed ADR, got 2/)});it("reads commit ADR from selected HEAD instead of the dirty worktree",()=>{const bad=prepare(),correct=readFileSync(resolve(bad.repo,A1_ADR),"utf8");write(bad.repo,A1_ADR,correct.replace("status: ready","status: draft"));bad.head=commit(bad.repo,
"bad HEAD ADR");write(bad.repo,A1_ADR,correct);expectRejected(gate(bad),/status mismatch/);const good=prepare(),clean=readFileSync(resolve(good.repo,A1_ADR),"utf8");write(good.repo,A1_ADR,clean.replace("status: ready","status: draft"));const committed=gate(good);assert.equal(committed.status,0,committed.stderr);expectRejected(run(good.repo,["--base",good.base,"--head",good.head,"--worktree"]),/status mismatch/)});it("bypasses ordinary API diffs but rejects missing, extra, and unsupport\
ed ADRs",()=>{const ordinary=repo(),base=sh(ordinary,["git","rev-parse","HEAD"]).trim();write(ordinary,"apps/api/src/modules/health/ordinary.ts","export {};\n");const fallback=run(ordinary,["--github-output","--base",base,"--head",commit(ordinary,"ordinary API")]);assert.equal(fallback.status,0,fallback.stderr);assert.match(fallback.stdout,/package_id=RP-01C.*test_command=test:rp02b1/s);const missing=prepare("RP-02B2a1",A1_FILES.slice(0,2),{includeAdr:false});expectRejected(gate(missing),/exactly one changed ADR/);
const extra=prepare();write(extra.repo,ORACLE["RP-02B2a2"][1],"status: ready\n");extra.head=commit(extra.repo,"extra ADR");expectRejected(gate(extra),/exactly one changed ADR/);const old=repo(true);write(old,A1_FILES[0],"production\n");write(old,"docs/adr/rp-02b2a-execution-core-budget.md","status: ready\n");expectRejected(gate({repo:old,base:BASELINE,head:commit(old,"old ADR")}),/unsupported ADR/)});it("rejects base-only, head-only, env-only, zero, unparseable, identical, and mismatch\
ed worktree SHAs",()=>{const item=prepare(),zero="0".repeat(40);for(const[args,pattern,env]of[[["--worktree","--base",item.base],/explicit HEAD/],[["--worktree","--head",item.head],/explicit BASE/],[["--worktree"],/explicit BASE/,{BASE_SHA:item.base,HEAD_SHA:item.head}],[["--base",zero,"--head",item.head],/zero BASE/],[["--base","HEAD~1","--head",item.head],/unparseable BASE/],[["--base",item.base,"--head","bad"],/unparseable HEAD/],[["--base",item.base,"--head",item.base],/identical BASE\/HEAD/],
[["--worktree","--base",item.base,"--head",item.base],/does not match current checkout HEAD/]])expectRejected(run(item.repo,args,env),pattern)});it("resolves ordinary PR, push, and manual ranges while rejecting zero-before pushes",()=>{const path=repo();const base=sh(path,["git","rev-parse","HEAD"]).trim();const branch=sh(path,["git","branch","--show-current"]).trim();const zero="0".repeat(40);sh(path,["git","checkout","-q","-b","feature"]);write(path,"feature.txt","x\n");const head=commit(
path,"feature");for(const args of[["--event","pull_request","--pr-base-ref",branch,"--pr-head",head],["--event","push","--push-before",base,"--push-head",head],["--event","workflow_dispatch","--manual-base",base,"--manual-head",head],["--event","push","--push-before",base,"--push-head",head,"--authorized-package-id","NOT_AUTHORIZED","--authorized-predecessor-sha","not_authorized"]]){const result=run(path,["--print-range",...args]);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,new RegExp(`base=${base}\\nhead=${head}`))}expectRejected(run(path,["--print-range","--event","push","--push-before",zero,"--push-head",head]),
/rejects zero PUSH_BEFORE/);assert.match(run(path,["--github-output","--base",base,"--head",head]).stdout,/package_id=RP-01C/)});it("rejects the explicit push and manual zero, unparseable, unreachable, and non-ancestor matrix",()=>{const path=repo(),base=sh(path,["git","rev-parse","HEAD"]).trim();write(path,"ordinary.txt","x\n");const head=commit(path,"range head"),forced=forceBefore(path,base,head),zero="0".repeat(40),unreachable="f".repeat(40),cases=[["push",["--event","push","--push-base-ref","main","--push-before",zero,"--push-head",head],/zero PUSH_BEFORE/],["push",["--event","push","--push-base-ref","main","--push-before","bad","--push-head",head],/unparseable PUSH_BEFORE/],["push",["--event","push","--push-base-ref","main","--push-before",unreachable,"--push-head",head],/unreachable PUSH_BEFORE/],["push",["--event","push","--push-base-ref","main","--push-before",forced,"--push-head",head],/not an ancestor/],["manual",["--event","workflow_dispatch","--manual-base",zero,"--manual-head",head],/zero MANUAL_BASE/],["manual",["--event","workflow_dispatch","--manual-base","bad","--manual-head",head],/unparseable MANUAL_BASE/],["manual",["--event","workflow_dispatch","--manual-base",unreachable,"--manual-head",head],/unreachable MANUAL_BASE/],["manual",["--event","workflow_dispatch","--manual-base",forced,"--manual-head",head],/manual base that is not an ancestor/]];assert.equal(cases.length,8);for(const[,args,pattern]of cases)expectRejected(run(path,["--print-range",...args]),pattern)});it("returns damaged landed A1 to B0 only for an ancestral push range",()=>{for(const mode of["draft","failed","missing"]){const item=prepare(),landed=item.head,ref=`landed-a1-${mode}`;sh(item.repo,["git","branch",ref,landed]);const failed=damagePackage(item.repo,"RP-02B2a1",mode);write(item.repo,"apps/api/src/modules/health/ordinary.ts","export {};\n");const head=commit(
item.repo,"ordinary after damaged A1"),forced=forceBefore(item.repo,landed,head);const range=pushRange(item.repo,ref,failed,head);assert.equal(range.status,0,range.stderr);assert.match(range.stdout,new RegExp(`base=${BASELINE}\\nhead=${head}`),mode);expectRejected(pushRange(item.repo,ref,forced,head),/not an ancestor/);expectRejected(pushRange(item.repo,ref,"0".repeat(40),head),/zero PUSH_BEFORE/);assert.notEqual(gate({repo:item.repo,base:BASELINE,head}).status,0)}});it("keeps unlanded\
 draft, failed, and missing-ready A1 cumulative on ancestral ranges",()=>{for(const options of[{status:"draft"},{status:"failed"},{includeAdr:false}]){const path=repo(true);sh(path,["git","branch","default-base",BASELINE]);const failed=addPackage(path,"RP-02B2a1",BASELINE,options);write(path,"apps/api/src/modules/health/ordinary.ts","export {};\n");const head=commit(path,"ordinary after unlanded A1"),forced=forceBefore(path,BASELINE,head);assert.match(pushRange(path,"default-base",failed,head).stdout,
new RegExp(`base=${BASELINE}\\nhead=${head}`));expectRejected(pushRange(path,"default-base",forced,head),/not an ancestor/);expectRejected(pushRange(path,"default-base","0".repeat(40),head),/zero PUSH_BEFORE/);assert.notEqual(gate({repo:path,base:BASELINE,head}).status,0)}});it("releases direct ordinary increments after A1 lands",()=>{const item=prepare(),landed=item.head;sh(item.repo,["git","branch","landed-a1",landed]);write(item.repo,"apps/api/src/modules/health/ordinary.ts","export\
 {};\n");const head=commit(item.repo,"ordinary after landed A1");const range=pushRange(item.repo,"ignored-main",landed,head);assert.match(range.stdout,new RegExp(`base=${landed}\\nhead=${head}`));assert.match(run(item.repo,["--github-output","--base",landed,"--head",head]).stdout,/package_id=RP-01C/);const newBranch=pushRange(item.repo,"ignored-main","0".repeat(40),head);expectRejected(newBranch,/zero PUSH_BEFORE/)});it("binds B2a2 push and PR ranges to the verified gate-prep predecessor",()=>{
const item=prepare("RP-02B2a2");const forced=forceBefore(item.repo,B2A2_BASELINE,item.head),direct=pushRange(item.repo,"ignored-main",item.base,item.head);assert.equal(direct.status,0,direct.stderr);assert.match(direct.stdout,new RegExp(`base=${item.base}\\nhead=${item.head}`));for(const before of[B2A2_BASELINE,STALE_B2A2_BASELINE])expectRejected(pushRange(item.repo,"ignored-main",before,item.head),/accepted G0 code head to be independently landed/);for(const[before,pattern]of[[forced,/not an ancestor/],["0".repeat(40),/zero PUSH_BEFORE/]])expectRejected(pushRange(item.repo,"ignored-main",before,item.head),pattern);sh(item.repo,["git","branch","accepted-g0-base",item.base]);const pullRequest=run(item.repo,["--print-range","--event","pull_request","--pr-base-ref","accepted-g0-base","--pr-head",item.head]);assert.match(pullRequest.stdout,new RegExp(`base=${item.base}\\nhead=${item.head}`));sh(item.repo,["git","branch","stale-pr-base",STALE_B2A2_BASELINE]);expectRejected(run(item.repo,["--print-range","--event","pull_request","--pr-base-ref","stale-pr-base","--pr-head",item.head]),/accepted G0 code head to be independently landed/);const manual=run(item.repo,["--print-range","--event","workflow_dispatch","--manual-base",item.base,"--manual-head",item.head]);assert.equal(manual.status,0,manual.stderr);assert.match(manual.stdout,new RegExp(`base=${item.base}\\nhead=${item.head}`));expectRejected(run(item.repo,["--print-range","--event","workflow_dispatch","--manual-base",STALE_B2A2_BASELINE,"--manual-head",item.head]),/accepted G0 code head to be independently landed/);const rejectedManual=run(item.repo,["--print-range","--event","workflow_dispatch","--manual-base",forced,"--manual-head",item.head]);expectRejected(rejectedManual,/manual base that is not an ancestor/);expectRejected(gate({...item,base:STALE_B2A2_BASELINE}),/BASE that is not an ancestor|requires exactly one changed ADR|requires a verified RP-02B2a2-G0 ancestor/);assert.equal(gate(item).status,0)});it("returns damaged B2a2 histories to gate-prep only for ancestral ranges",()=>{for(const mode of["draft","failed","missing"]){const item=prepare(
"RP-02B2a2");const landed=item.head;const failed=damagePackage(item.repo,"RP-02B2a2",mode);write(item.repo,"apps/api/src/modules/health/ordinary.ts","export {};\n");const head=commit(item.repo,`ordinary after damaged B2a2 ${mode}`);const forced=forceBefore(item.repo,landed,head);const range=pushRange(item.repo,"ignored-main",failed,head);assert.equal(range.status,0,range.stderr);assert.match(range.stdout,new RegExp(`base=${item.base}\\nhead=${head}`),mode);expectRejected(pushRange(item.repo,"ignor\
ed-main",forced,head),/not an ancestor/);expectRejected(pushRange(item.repo,"ignored-main","0".repeat(40),head),/zero PUSH_BEFORE/);assert.notEqual(gate({repo:item.repo,base:item.base,head}).status,0)}});it("uses before/after for ordinary pushes after B2a2 lands",()=>{const item=prepare("RP-02B2a2");const landed=item.head;write(item.repo,"apps/api/src/modules/health/ordinary.ts","export {};\n");const head=commit(item.repo,"ordinary after landed B2a2");const range=pushRange(item.repo,
"ignored-main",landed,head);assert.match(range.stdout,new RegExp(`base=${landed}\\nhead=${head}`));assert.match(run(item.repo,["--github-output","--base",landed,"--head",head]).stdout,/package_id=RP-01C/)});it("keeps A3-A5 on the explicit before/after range",()=>{for(const id of RANGE_PACKAGES){const item=prepare(id);const range=pushRange(item.repo,"ignored-main",item.base,item.head);assert.equal(range.status,0,range.stderr);assert.match(range.stdout,new RegExp(`base=${item.base}\\nhead=${item.head}`),
id);assert.equal(gate(item).status,0,id)}});it("releases landed A1 ordinary pushes while keeping A1 and force-push safety",()=>{const item=prepare(),first=item.head,zero="0".repeat(40);sh(item.repo,["git","branch","landed-a1",first]);write(item.repo,"apps/api/src/modules/health/ordinary.ts","export {};\n");const second=commit(item.repo,"ordinary after A1"),fixed=(before,head2)=>run(item.repo,["--print-range","--event","push","--push-base-ref","landed-a1","--push-before",before,"--push-head",head2]);
for(const before of[first]){const ordinaryRange2=fixed(before,second);assert.match(ordinaryRange2.stdout,new RegExp(`base=${first}\\nhead=${second}`));assert.match(run(item.repo,["--github-output","--base",first,"--head",second]).stdout,/package_id=RP-01C/)}expectRejected(fixed(zero,second),/zero PUSH_BEFORE/);write(item.repo,A1_FILES[0],"second A1 push\n");const third=commit(item.repo,"second A1 push");const thirdRange=fixed(second,third);assert.match(thirdRange.stdout,new RegExp(`base=${BASELINE}\\nhead=${third}`),thirdRange.stderr);
sh(item.repo,["git","checkout","-q","--detach",BASELINE]);write(item.repo,A1_FILES[0],"force push\n");write(item.repo,A1_ADR,"status: ready\n");const forced=commit(item.repo,"force push");write(item.repo,GATE_SCRIPT,readFileSync(resolve(ROOT,GATE_SCRIPT)));sh(item.repo,["git","branch","forced",forced]);for(const ref of sh(item.repo,["git","for-each-ref","--format=%(refname)","refs/remotes"]).trim().split("\n").filter(Boolean))sh(item.repo,["git","update-ref","-d",ref]);const checkout=mkdtempSync(resolve(tmpdir(),"rp02b2a-checkout-"));sh(tmpdir(),["git","clone","-\
q","--depth=2","--single-branch","--no-tags","--branch","forced",`file://${item.repo}`,checkout]);write(checkout,GATE_SCRIPT,readFileSync(resolve(ROOT,GATE_SCRIPT)));sh(checkout,["git","branch","default-base",BASELINE]);assert.notEqual(spawnSync("git",["cat-file","-e",`${second}^{commit}`],{cwd:checkout}).status,0);expectRejected(run(checkout,["--print-range","--event","push","--push-base-ref","default-base","--push-before",second,"--push-head",forced]),/unreachable PUSH_BEFORE/);const ordinaryRepo=repo(
true);sh(ordinaryRepo,["git","branch","default-base",BASELINE]);unlinkSync(resolve(ordinaryRepo,GATE_SCRIPT));write(ordinaryRepo,"ordinary.txt","ordinary\n");const ordinary=commit(ordinaryRepo,"unrelated push");write(ordinaryRepo,GATE_SCRIPT,readFileSync(resolve(ROOT,GATE_SCRIPT)));const ordinaryRange=run(ordinaryRepo,["--print-range","--event","push","--push-base-ref","default-base","--push-before",second,"--push-head",ordinary]);expectRejected(ordinaryRange,/unreachable PUSH_BEFORE/);assert.match(run(ordinaryRepo,["--github-output","--base",BASELINE,"--head",ordinary]).stdout,/package_id=RP-01C/);sh(ordinaryRepo,["git",
"checkout","-q","--detach",BASELINE]);unlinkSync(resolve(ordinaryRepo,GATE_SCRIPT));write(ordinaryRepo,A1_ADR,"status: ready\n");write(ordinaryRepo,"outside/evil.ts","evil\n");const malicious=commit(ordinaryRepo,"malicious push");write(ordinaryRepo,GATE_SCRIPT,readFileSync(resolve(ROOT,GATE_SCRIPT)));const maliciousRange=run(ordinaryRepo,["--print-range","--event","push","--push-base-ref","default-base","--push-before",second,"--push-head",malicious]);expectRejected(maliciousRange,/unreachable PUSH_BEFORE/);expectRejected(gate({repo:ordinaryRepo,base:BASELINE,head:malicious}),/manifest violation/);const head=forced;
for(const[args,pattern,env]of[[["--push-before",head,"--push-head",head],/unsupported event: <missing>/,{GITHUB_EVENT_NAME:"push"}],[["--event","workflow_dispatch","--manual-base","","--manual-head",head],/explicit MANUAL_BASE/],[["--event","push","--push-head",head],/explicit PUSH_BEFORE/],[["--event","push","--push-base-ref","landed-a1","--push-before","HEAD~1","--push-head",head],/unparseable PUSH_BEFORE/]])expectRejected(run(item.repo,["--print-range",...args],env),pattern)});it("fails \
closed for manifest, budget, and missing categories",()=>{const outside=prepare();write(outside.repo,"apps/admin-web/src/outside.ts","x\n");outside.head=commit(outside.repo,"outside");expectRejected(gate(outside),/manifest violation/);const budget=prepare("RP-02B2a1",A1_FILES,{overrides:{actual_net_additions:3e3}});write(budget.repo,A1_FILES[0],"line\n".repeat(3e3));budget.head=commit(budget.repo,"budget");expectRejected(gate(budget),/budget exceeded/);expectRejected(gate(prepare("RP-02B\
2a1",[A1_FILES[1],A1_ADR])),/net additions budget exceeded|missing required production/);expectRejected(gate(prepare("RP-02B2a1",[A1_FILES[0],A1_ADR])),/missing required test/);const a2Production=EXCLUSIVE["RP-02B2a2"],a2Test="apps/api/test/rp02b2a/authority-claim.test.ts",a2Adr=ORACLE["RP-02B2a2"][1];expectRejected(gate(prepare("RP-02B2a2",[a2Test,a2Adr])),/RP-02B2a2 missing required production category/);expectRejected(gate(prepare("RP-02B2a2",[a2Production,a2Adr])),/RP-02B2a2 missing required test category/)});it("rejects gate-only and test-only production diffs",()=>{expectRejected(gate(prepare("RP-02B2a1",["scripts/rp02b2a-package-gate.mjs","scripts/rp02b2a-package-gate.test.mjs",".github/workflows/rp01c-fixtures.yml",A1_ADR])),/missing required production/);expectRejected(gate(prepare("RP-02B2a1",[A1_FILES[1],
A1_ADR])),/missing required production/)});it("does not truncate TAB paths",()=>{const path=repo(true);write(path,"packages/shared/src/api.ts	outside","x\n");write(path,A1_FILES[1],"test\n");write(path,A1_ADR,"status: ready\n");const result=gate({repo:path,base:BASELINE,head:commit(path,"TAB")});expectRejected(result,/manifest violation: packages\/shared\/src\/api\.ts\s+outside/)});it("rejects late NUL, C0/C1 bounds, and invalid UTF-8 in tracked and untracked content",()=>{const lateNul=Buffer.
concat([Buffer.alloc(9001,97),Buffer.from([0]),Buffer.from("tail")]);for(const[bytes,pattern,attributes]of[[lateNul,/control U\+0000/,true],[Buffer.from([31]),/control U\+001f/,false],[Buffer.from([194,128]),/control U\+0080/,false],[Buffer.from([194,159]),/control U\+009f/,false],[Buffer.from([195,40]),/invalid UTF-8/,false]]){const tracked=repo(true);if(attributes)write(tracked,".gitattributes","packages/shared/src/api.ts diff\n");write(tracked,"packages/shared/src/api.ts",bytes);expectRejected(
gate({repo:tracked,base:BASELINE,head:commit(tracked,"invalid tracked text")}),pattern);const untracked=repo(true);write(untracked,A1_FILES[0],bytes);expectRejected(run(untracked,["--base",BASELINE,"--head",BASELINE,"--worktree"]),pattern)}});it("rejects symlink manifest paths in worktree and commit modes",()=>{const path=repo(true),file="packages/shared/src/api.ts";unlinkSync(resolve(path,file));symlinkSync("novels.ts",resolve(path,file));expectRejected(run(path,["--base",BASELINE,"--\
head",BASELINE,"--worktree"]),/non-regular worktree path/);expectRejected(gate({repo:path,base:BASELINE,head:commit(path,"symlink manifest path")}),/non-regular commit path/)});it("includes both rename/copy paths and fails across manifest boundaries",()=>{const inside=repo(true);sh(inside,["git","mv","packages/shared/src/api.ts",A1_FILES[0]]);write(inside,A1_FILES[1],"test\n");write(inside,A1_ADR,adr({status:"ready",package_id:"RP-02B2a1",manifest_id:"RP-02B2a1-v1",baseline_sha:BASELINE,
hard_max_files:18,hard_max_net_additions:1900,actual_files:5,actual_net_additions:0}));const net=stats(inside,BASELINE).net;write(inside,A1_ADR,readFileSync(resolve(inside,A1_ADR),"utf8").replace("actual_net_additions: 0",`actual_net_additions: ${net}`));const insideResult=gate({repo:inside,base:BASELINE,head:commit(inside,"inside rename")});assert.equal(insideResult.status,0,insideResult.stderr);for(const[source,target,pattern]of[["README.md",A1_FILES[0],/README\.md/],["packages/shared/src/api.\
ts","outside/renamed.ts",/outside\/renamed\.ts/]]){const path=repo(true);mkdirSync(dirname(resolve(path,target)),{recursive:true});sh(path,["git","mv",source,target]);write(path,A1_FILES[1],"test\n");write(path,A1_ADR,"status: ready\n");expectRejected(gate({repo:path,base:BASELINE,head:commit(path,"cross rename")}),pattern)}const copy=repo(true);write(copy,A1_FILES[0],readFileSync(resolve(copy,"README.md")));write(copy,A1_FILES[1],"test\n");write(copy,A1_ADR,"status: ready\n");expectRejected(
		gate({repo:copy,base:BASELINE,head:commit(copy,"cross copy")}),/README\.md/)});it("uses whole-package max(0,total added-total deleted)",()=>{const path=repo(true),base=BASELINE;write(path,"packages/shared/src/novels.ts","new\n");write(path,A1_FILES[1],"test\n");write(path,A1_ADR,adr({status:"ready",package_id:"\
		RP-02B2a1",manifest_id:"RP-02B2a1-v1",baseline_sha:base,hard_max_files:18,hard_max_net_additions:1900,actual_files:4,actual_net_additions:0}));const result=gate({repo:path,base,head:commit(path,"aggregate")});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/netAdditions=0/)});it("keeps worktree and commit numstat counts identical",()=>{const path=repo(true),render=net=>adr({status:"ready",package_id:"RP-02B2a1",manifest_id:"RP-02B2a1-v1",baseline_sha:BASELINE,hard_max_files:18,
hard_max_net_additions:1900,actual_files:4,actual_net_additions:net});write(path,A1_FILES[0],"alpha	beta\r\ngamma\n");write(path,A1_FILES[1],"test\n");write(path,A1_ADR,render(-1));const probe=run(path,["--base",BASELINE,"--head",BASELINE,"--worktree"]),match=/actual_net_additions mismatch: -1 != (\d+)/.exec(probe.stderr);assert.ok(match,probe.stderr);write(path,A1_ADR,render(match[1]));const worktree=run(path,["--base",BASELINE,"--head",BASELINE,"--worktree"]);assert.equal(worktree.status,0,worktree.
stderr);expectRejected(run(path,["--base",BASELINE,"--head",BASELINE,"--worktree","--github-output"]),/rejects --worktree with --github-output/);const committed=gate({repo:path,base:BASELINE,head:commit(path,"same numstat")});assert.equal(committed.status,0,committed.stderr);assert.match(worktree.stdout,new RegExp(`netAdditions=${match[1]}`));assert.match(committed.stdout,new RegExp(`netAdditions=${match[1]}`))});it("binds all package commands and ADR contracts",()=>{for(const[id,command]of Object.entries(COMMANDS)){const item=prepare(id),passed=gate(item),output=githubOutput(item);
assert.equal(passed.status,0,`${id}: ${passed.stderr}`);assert.match(output.stdout,new RegExp(`package_id=${id}.*test_command=${command}`,"s"))}for(const[field,value,pattern]of[["package_id","wrong",/package_id mismatch/],["manifest_id","wrong",/manifest_id mismatch/],["hard_max_files",999,/hard_max_files mismatch/],["hard_max_net_additions",999,/hard_max_net_additions mismatch/]])expectRejected(gate(prepare("RP-02B2a2",void 0,{overrides:{[field]:value}})),pattern);const duplicate=prepare("RP-02B2a2"),duplicateAdr=ORACLE["RP-02B2a2"][1];write(duplicate.repo,duplicateAdr,`${readFileSync(resolve(duplicate.repo,duplicateAdr),"utf8")}status: ready\n`);duplicate.head=commit(duplicate.repo,"duplicate ADR status");expectRejected(gate(duplicate),/ADR duplicate field: status/);const unknown=prepare("RP-02B2a2"),unknownAdr=ORACLE["RP-02B2a2"][1];write(unknown.repo,unknownAdr,`${readFileSync(resolve(unknown.repo,unknownAdr),"utf8")}authorization: approved\n`);unknown.head=commit(unknown.repo,"unknown ADR authorization");expectRejected(gate(unknown),/ADR unsupported field: authorization/);const unauthorized=prepare("RP-02B2a2");unauthorized.authorizedPackageId="";expectRejected(gate(unauthorized),/trusted admission package mismatch/)});it("expands YAML aliase\
s and rejects unknown or cyclic aliases",()=>{const positive=mutate(text=>aliasPaths(text));assert.equal(positive.status,0,positive.stderr);for(const[change,pattern]of[[text=>aliasPaths(text,"missing"),/unknown YAML alias/],[text=>aliasPaths(text).replace("      base_sha: &gate_paths","      base_sha: &gate_paths\n        cycle: *gate_paths"),/cyclic YAML alias/]]){const result=mutate(change);assert.notEqual(result.status,0);expectRejected(result,pattern)}});it("parses and enforces the structured workflow c\
ontract",()=>{const trusted=trustedWorkflow();assert.equal(trusted.status,0,trusted.stderr);assert.match(trusted.stdout,new RegExp(`canonical_sha256=${TRUSTED_WORKFLOW_ORACLE_SHA256}`));for(const change of[text=>text.replace("pull_request_target:","pull_request:"),text=>text.replace("  actions: read\n",""),text=>text.replace("      - synchronize\n","      - synchronize\n      - closed\n"),text=>text.replace("    steps:\n      # Candidate materialization","    if: always()\n    steps:\n      # Candidate materialization"),text=>text.replace("actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5","actions/checkout@v4"),text=>text.replace("actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020","actions/setup-node@v4"),text=>text.replace("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02","actions/upload-artifact@v4"),text=>text.replace("          fetch-depth: 0","          fetch-depth: 1")]){const result=mutateTrustedWorkflow(change);assert.notEqual(result.status,0);expectRejected(result,/trusted (?:admission|workflow)/)}assert.equal(workflow().status,0);assert.equal(workflow(WORKFLOW,["--package-id","RP-01C","--test-command","test:rp02b1"]).status,0);for(const file of[A1_ADR,"scripts/rp02b2a-package-gate.mjs",A1_FILES[1],".github/workflows/rp01a-e2e.yml",".github/workflows/rp01b-dom.yml",".github/workflows/remediation-governance.yml"])assert.equal(workflow(WORKFLOW,["--trigger-file",file]).status,0,file);for(const args of[["--package-id","RP-02B2a1","--test-command","wrong"],["--package-id","wrong","--test-command","test:rp02b2a1"]])assert.notEqual(workflow(WORKFLOW,args).status,0);const clean=CLEAN_ENV;const resolver=`${clean}\
 node scripts/rp02b2a-package-gate.mjs --github-output --base "$B2A_BASE_SHA" --head "$B2A_HEAD_SHA" --gate-source "$B2A_GATE_SOURCE_SHA" --g0-evidence-sha "$B2A_G0_EVIDENCE_SHA" --authorized-package-id "$B2A_AUTHORIZED_PACKAGE_ID" --authorized-predecessor-sha "$B2A_AUTHORIZED_PREDECESSOR_SHA" >> "$GITHUB_OUTPUT"`,selected=`${clean} npm run "$B2A_TEST_COMMAND"`,selfCheck=`${clean} node scripts/rp02b2a-package-gate.mjs --verify-workflow .github/workflows/rp01c-fixtures.yml --package-id "$B2A_PACKAGE_ID" --test-command "$B2A_TEST_COMMAND"`;const changes=[[text=>text.replace("required: true","required: false"),/requires base_sha/],[text=>text.replace("      - 'scripts/rp02b2a-package-gate.*'\n",""),/missing required path/],[text=>text.replace(`          ${selected}`,"          echo selected-package-command-disabled"),/selected package command/],[text=>text.replace(
"      - name: Resolve B2a package command","      - name: Resolve B2a package command\n        continue-on-error: true"),/step 4 keys mismatch|required step is disabled/],[text=>text.replace("        id: b2a-package\n","        id: b2a-package\n        shell: bash\n"),/step 4 keys mismatch|custom shell/],[text=>text.replace("      - env:\n          B2A_TEST_COMMAND: ${{ steps.b2a-package.outputs.test_command }}","      - shell: bash\n        env:\n          B2A_TEST_COMMAND: ${{ steps.b2a-package.outputs.test_command }}"),/step [0-9]+ keys mismatch|custom shell/],
[text=>text.replace("\njobs:\n","\ndefaults:\n  run:\n    shell: bash\n\njobs:\n"),/workflow defaults\.run\.shell/],[text=>text.replace("  rp01c-fixtures:\n","  rp01c-fixtures:\n    defaults:\n      run:\n        shell: bash\n"),/job defaults\.run\.shell/],[text=>text.replace("--push-before","--before-missing"),/shell semantics mismatch/],[text=>text.replace("--push-head","--head-missing"),/shell semantics mismatch/],[text=>text.replace("--manual-base","--manual-base-missing"),/shell semantics mismatch/],
[text=>text.replace("--manual-head","--manual-head-missing"),/shell semantics mismatch/],[text=>text.replace(" || github.event.after }}"," || github.sha }}"),/checkout ref/],[text=>text.replace("Resolve B2a package gate range","Resolve B2a1 package gate range"),/step named Resolve B2a package gate range/],[text=>text.replace("id: b2a-range","id: b2a1-range"),/dynamic package step ids mismatch/],[text=>text.replace("id: b2a-package","id: static-package"),/dynamic package step ids mismatch/],[text=>text.
replace(`${clean} node scripts/rp02b2a-package-gate.mjs --print-range`,"node scripts/rp02b2a-package-gate.mjs --print-range"),/shell semantics mismatch/],[text=>text.replace(`          ${resolver}`,`          # ${resolver}`),/shell semantics mismatch/],[text=>text.replace(`          ${selfCheck}`,`          echo '${selfCheck}'`),/shell semantics mismatch/],[text=>text.replace(`          ${selected}`,`          printf '%s\\n' '${selected}'`),/shell semantics mismatch/],[text=>text.
replace(`          ${resolver}`,`          cat <<'EOF'
          ${resolver}
          EOF`),/shell semantics mismatch/],[text=>text.replace(selected,`${selected} || true`),/shell semantics mismatch/],[text=>text.replace(`          ${resolver}`,`          if false; then
          ${resolver}
          fi`),/shell semantics mismatch/],[text=>text.replace(`          ${resolver}`,'          echo "package_id=RP-02B2a1" >> "$GITHUB_OUTPUT"\n          echo "test_command=test:rp02b2a1" >> "$GITHUB_OUTPUT"'),/shell semantics mismatch/]];for(const[index,[change,pattern]]of changes.entries()){const result=mutate(change,`workflow mutation ${index} did not change fixture`);assert.notEqual(result.status,0,`workflow mutation ${index} passed`);expectRejected(result,pattern,`workflow mutation ${index}`)}})});
it("keeps candidate-owned gate, test, and oracle out of the trusted G0 checkout", () => {
  const candidate = prepare("RP-02B2a2"), gateMarker = "CANDIDATE_GATE_REPLACED_TRUSTED_G0", oracleMarker = "CANDIDATE_TEST_ORACLE_EXECUTED";
  write(candidate.repo, GATE_SCRIPT, `console.error(${JSON.stringify(gateMarker)}); process.exit(0);\n`);
  write(candidate.repo, "scripts/rp02b2a-package-gate.test.mjs", `console.error(${JSON.stringify(oracleMarker)}); process.exit(0);\n`);
  candidate.head = commit(candidate.repo, "candidate-owned gate test oracle");
  const candidateOwned = gate(candidate);
  assert.equal(candidateOwned.status, 0, candidateOwned.stderr);
  assert.match(candidateOwned.stderr, new RegExp(gateMarker));
  const trusted = trustedCheckoutGate(candidate);
  expectRejected(trusted, /manifest violation:.*scripts\/rp02b2a-package-gate\.mjs.*scripts\/rp02b2a-package-gate\.test\.mjs/s);
  assert.doesNotMatch(`${trusted.stdout}\n${trusted.stderr}`, new RegExp(`${gateMarker}|${oracleMarker}`));
  const trustedContext = runTrustedContextWorkflowShell();
  assert.equal(trustedContext.status, 0, `${trustedContext.stdout}\n${trustedContext.stderr}`);
  assert.match(trustedContext.githubOutput, /run_id=50000001.*workflow_id=40000001.*candidate_sha=b{40}/s);
  for (const [options, pattern] of [
    [{ apiRunId: "50000002" }, /current run API identity/],
    [{ apiRunAttempt: "3" }, /current run API identity/],
    [{ path: ".github/workflows/wrong.yml@refs/heads/main" }, /workflow path/],
    [{ event: "push" }, /event or workflow revision/],
    [{ head: "9".repeat(40) }, /event or workflow revision/],
    [{ workflowRef: "example/repo/.github/workflows/rp02b2a-admission.yml@refs/heads/other" }, /workflow_ref/],
    [{ defaultBranch: "develop" }, /repository default branch/],
    [{ prBaseRef: "release" }, /repository default branch/],
    [{ eventRef: "refs/heads/release", workflowRef: "example/repo/.github/workflows/rp02b2a-admission.yml@refs/heads/release" }, /repository default branch/], [{ gateSourceSha: "0cfcbd19bb998bd84faa72cf4549eca17e5ab190" }, /revoked G0 lineage/], [{ g0EvidenceSha: "3ad4c16be3053aeacc84144cbfe954da328b453a" }, /revoked G0 lineage/],
  ]) expectRejected(runTrustedContextWorkflowShell(options), pattern);
  const liveAdmission = runAdmissionEvidenceWorkflowShell();
  assert.equal(liveAdmission.status, 0, `${liveAdmission.stdout}\n${liveAdmission.stderr}`);
  assert.match(liveAdmission.githubOutput, /candidate_sha=b{40}.*manifest_digest=2{64}/s);
  assert.equal(JSON.parse(readFileSync(liveAdmission.artifactPath, "utf8")).manifest_digest, "2".repeat(64));
  for (const [options, pattern] of [
    [{ liveNumber: "43" }, /no longer the open admission target/],
    [{ liveState: "closed" }, /no longer the open admission target/],
    [{ liveBaseRef: "release" }, /stale pull_request_target snapshot/],
    [{ liveBase: "8".repeat(40) }, /stale pull_request_target snapshot/],
    [{ liveHead: "9".repeat(40) }, /stale pull_request_target snapshot/],
  ]) expectRejected(runAdmissionEvidenceWorkflowShell(options), pattern);
  const digestCandidate = prepare("RP-02B2a2"), originalHead = digestCandidate.head;
  const originalAdmission = authoritativeGate(digestCandidate);
  assert.equal(originalAdmission.status, 0, originalAdmission.stderr);
  const originalDigest = /^manifest_digest=([a-f0-9]{64})$/m.exec(originalAdmission.stdout)?.[1];
  assert.ok(originalDigest, originalAdmission.stdout);
  mutateCandidateBlob(digestCandidate);
  const changedAdmission = authoritativeGate(digestCandidate);
  assert.equal(changedAdmission.status, 0, changedAdmission.stderr);
  const changedDigest = /^manifest_digest=([a-f0-9]{64})$/m.exec(changedAdmission.stdout)?.[1];
  assert.ok(changedDigest, changedAdmission.stdout);
  assert.notEqual(changedDigest, originalDigest, "candidate manifest blob mutation must change manifest_digest");
  const staleDigestAdmission = runAdmissionEvidenceWorkflowShell({ prHead: originalHead, liveHead: digestCandidate.head, manifestDigest: originalDigest });
  expectRejected(staleDigestAdmission, /stale pull_request_target snapshot/);
  assert.doesNotMatch(staleDigestAdmission.githubOutput, /manifest_digest=/, "stale candidate digest must not be published");
});

it("fail-closes authoritative pull_request_target admission before candidate execution",()=>{const admitted=prepare("RP-02B2a2"),authoritative=authoritativeGate(admitted);assert.equal(authoritative.status,0,authoritative.stderr);assert.match(authoritative.stdout,new RegExp(`event_base_sha=${admitted.base}.*gate_source_sha=${admitted.gateSource}.*g0_evidence_sha=${admitted.g0EvidenceSha}.*g0_evidence_digest=[a-f0-9]{64}.*manifest_digest=[a-f0-9]{64}`,"s"));assert.equal(/^manifest_digest=([a-f0-9]{64})$/m.exec(authoritative.stdout)?.[1],expectedManifestDigest(admitted));const missing=run(admitted.repo,["--github-output","--event","pull_request_target","--event-base",admitted.base,"--event-head",admitted.head]);expectRejected(missing,/requires the repository-controlled package\/predecessor tuple/);expectRejected(authoritativeGate(admitted,{g0EvidenceSha:""}),/requires explicit G0_EVIDENCE/);expectRejected(authoritativeGate(admitted,{g0EvidenceSha:"f".repeat(40)}),/rejects unreachable G0_EVIDENCE/);const wrongParent=sh(admitted.repo,["git","commit-tree",`${admitted.gateSource}^{tree}`,"-p",admitted.gateSource,"-m","wrong evidence parent"]).trim(),wrongEvidence=sh(admitted.repo,["git","commit-tree",`${admitted.g0EvidenceSha}^{tree}`,"-p",wrongParent,"-m","wrong-parent E1"]).trim();expectRejected(authoritativeGate(admitted,{g0EvidenceSha:wrongEvidence}),/must be one direct child commit/);expectRejected(authoritativeGate(admitted,{authorizedPackageId:"RP-02B2a3"}),/trusted admission package mismatch/);expectRejected(authoritativeGate(admitted,{authorizedPredecessorSha:"0".repeat(40)}),/zero AUTHORIZED_PREDECESSOR/);expectRejected(authoritativeGate(admitted,{extra:["--base",admitted.base]}),/rejects caller-selected base\/head/);

const advanced=prepare("RP-02B2a2"),advancedBase=forceBefore(advanced.repo,advanced.base,advanced.head),advancedAdmission=authoritativeGate(advanced,{eventBase:advancedBase});assert.equal(advancedAdmission.status,0,advancedAdmission.stderr);assert.match(advancedAdmission.stdout,new RegExp(`event_base_sha=${advancedBase}`));const skipped=prepare("RP-02B2a3");expectRejected(authoritativeGate(skipped,{authorizedPackageId:"RP-02B2a2"}),/trusted admission package mismatch/);expectRejected(authoritativeGate(skipped,{authorizedPredecessorSha:skipped.gateSource}),/merge-base must equal the authorized predecessor/);const unrelatedBase=sh(admitted.repo,["git","commit-tree",`${admitted.head}^{tree}`,"-m","unrelated event base"]).trim();expectRejected(authoritativeGate(admitted,{eventBase:unrelatedBase}),/workflow base must descend from the accepted G0/);expectRejected(run(admitted.repo,["--base",admitted.base,"--head",admitted.head,"--authorized-g0",admitted.gateSource]),/retired --authorized-g0/)});

const GATE_PREP_EVIDENCE_ID = "RP-02B2a2-G0-E1";
const GATE_PREP_EVIDENCE_COMMAND = "test:governance";
const GATE_TEST_COUNT = readFileSync(resolve(ROOT, "scripts/rp02b2a-package-gate.test.mjs"), "utf8").match(/\bit\s*\(/g)?.length ?? 0;
const GATE_PREP_EVIDENCE_FILES = Object.freeze([
  "docs/reviews/main-control-event-ledger.md",
  "docs/reviews/main-control-status.md",
  "docs/reviews/remediation-rmd-task-002-003-rp-02b2a1-verification-2026-07-15.md",
]);
const GATE_PREP_EVIDENCE_RUNS = Object.freeze({
  g0_evidence_rp01a_run: "30000001",
  g0_evidence_rp01b_run: "30000002",
  g0_evidence_rp01c_run: "30000003",
  g0_evidence_governance_run: "30000004",
});
function evidenceText(parent, overrides = {}) {
  return Object.entries({
    g0_evidence_parent_sha: parent,
    ...GATE_PREP_EVIDENCE_RUNS,
    g0_evidence_a2_authorization: "not_authorized",
    g0_evidence_issue_closed_count: "9/42",
    g0_evidence_rmd_task_002: "partial",
    g0_evidence_rmd_task_003: "open",
    ...overrides,
  }).map(([field, value]) => `${field}: ${value}`).join("\n") + "\n";
}
function finalEvidenceText(file, existing, parent, net, fields, gateCount = `${GATE_TEST_COUNT}/${GATE_TEST_COUNT}`) {
  const short = parent.slice(0, 7), runs = GATE_PREP_EVIDENCE_RUNS;
  if (file === GATE_PREP_EVIDENCE_FILES[1]) return existing
    .replace(/^当前整改包\s+.*$/m, `当前整改包    RP-02B2a2-G0 accepted code head ${short}，四路远程 CI 已通过；E1 发布关闭证据，B2a2 业务实现仍未授权`)
    .replace(/^当前状态\s+.*$/m, `当前状态      G0 accepted code head ${short}，远程 runs ${Object.values(runs).join("/")} 均 success；B2a2 仍 not_authorized`)
    .replace(/^\| RP-02B2a2-G0 整改后最终复核 \|.*$/m, `| RP-02B2a2-G0 整改后最终复核 | 已完成 | accepted code head \`${short}\`；16 files / ${net} net additions；package gate ${gateCount}；四路远程 CI completed/success；B2a2 保持 not_authorized |`)
    .replace(/^1\. .*RP-02B2a2-G0.*$/m, `1. RP-02B2a2-G0 accepted code head \`${short}\` 与四路远程 CI 已完成；E1 只发布关闭证据。B2a2 继续 \`not_authorized\`。`) + `\n\n${fields}`;
  if (file === GATE_PREP_EVIDENCE_FILES[0]) return `${existing.trimEnd()}\n\n### MCE-RP02B2A2-G0-E1-REMOTE-ACCEPTED\n\n\`\`\`text\nevent_type: governance_bootstrap_remote_accepted\npackage_id: ${GATE_PREP_EVIDENCE_ID}\naccepted_code_head: ${parent}\n${fields.trimEnd()}\nmc_decision: RP-02B2a2-G0 关闭；B2a2 继续 not_authorized。\n\`\`\`\n`;
  return `${existing.trimEnd()}\n\n### 7.3 G0 accepted code head 与远程关闭证据\n\n| 证据项 | 固定结果 |\n| --- | --- |\n| accepted_code_head | \`${parent}\` |\n| accepted_code_package | 16 files / ${net} net additions；package gate ${gateCount} |\n| remote_rp01a | run \`${runs.g0_evidence_rp01a_run}\` |\n| remote_rp01b | run \`${runs.g0_evidence_rp01b_run}\` |\n| remote_rp01c | run \`${runs.g0_evidence_rp01c_run}\` |\n| remote_governance | run \`${runs.g0_evidence_governance_run}\` |\n| authorization | B2a2 继续 \`not_authorized\` |\n\n${fields}`;
}
function publishEvidence(gatePrep, { files = GATE_PREP_EVIDENCE_FILES, common = {}, perFile = {}, extraByFile = {}, transformByFile = {}, extraFile, appendOnly = false, gateCount = `${GATE_TEST_COUNT}/${GATE_TEST_COUNT}` } = {}) {
  const net = stats(gatePrep.repo, B2A2_BASELINE).net;
  for (const file of files) {
    const existing = readFileSync(resolve(gatePrep.repo, file), "utf8");
    const fields = evidenceText(gatePrep.head, { ...common, ...perFile[file] });
    const body = appendOnly ? `${existing.trimEnd()}\n\n${fields}` : finalEvidenceText(file, existing, gatePrep.head, net, fields, gateCount);
    const transformed = transformByFile[file]?.(body) ?? body;
    write(gatePrep.repo, file, `${transformed}${extraByFile[file] ?? ""}`);
  }
  if (extraFile) write(gatePrep.repo, extraFile, "outside evidence scope\n");
  return { repo: gatePrep.repo, base: gatePrep.head, head: commit(gatePrep.repo, GATE_PREP_EVIDENCE_ID) };
}
function prepareEvidence(options) { return publishEvidence(prepare(GATE_PREP_ID), options); }
function evidenceResult(options) { const item = prepareEvidence(options); return { item, result: gate(item) }; }
function moveMarkdownSectionBodyLater(text, heading, laterHeading) {
  const headingMatch = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*$`, "m").exec(text);
  assert.ok(headingMatch, `missing section to move: ${heading}`);
  const bodyStart = headingMatch.index + headingMatch[0].length, level = /^#+/.exec(heading)?.[0].length;
  assert.ok(level, `invalid markdown heading: ${heading}`);
  const remainder = text.slice(bodyStart), next = new RegExp(`^#{1,${level}}[ \\t]+`, "m").exec(remainder), bodyEnd = bodyStart + (next?.index ?? remainder.length);
  return `${text.slice(0, bodyStart)}\n\n${laterHeading}${text.slice(bodyStart, bodyEnd)}${text.slice(bodyEnd)}`;
}
function prepareCombinedGatePrepEvidence() {
  const path = repo(B2A2_BASELINE), base = sh(path, ["git", "rev-parse", "HEAD"]).trim();
  const [manifestId, adrPath, hardMaxFiles, hardMaxNetAdditions] = ORACLE[GATE_PREP_ID];
  for (const file of select(GATE_PREP_ID).filter((item) => item !== adrPath)) write(path, file, readFileSync(resolve(ROOT, file)));
  for (const file of GATE_PREP_EVIDENCE_FILES) write(path, file, `${readFileSync(resolve(path, file), "utf8").trimEnd()}\n\n${evidenceText(base)}`);
  const render = (files, net) => adr({ status: "ready", package_id: GATE_PREP_ID, manifest_id: manifestId, baseline_sha: B2A2_BASELINE, hard_max_files: hardMaxFiles, hard_max_net_additions: hardMaxNetAdditions, actual_files: files, actual_net_additions: net });
  write(path, adrPath, render(0, 0));
  const actual = stats(path, base);
  write(path, adrPath, render(actual.files, actual.net));
  return { repo: path, base, head: commit(path, "combined G0 and E1") };
}
function appendGatePrepRevision(gatePrep) {
  const file = "docs/modules/rp-02b2-dispatcher-transport-implementation-package.md";
  write(gatePrep.repo, file, `${readFileSync(resolve(gatePrep.repo, file), "utf8").trimEnd()}\n\nIncremental G0 revision must be rejected.\n`);
  const adrPath = GATE_PREP_ADR;
  const reset = readFileSync(resolve(gatePrep.repo, adrPath), "utf8").replace(/^actual_files:.*$/m, "actual_files: 0").replace(/^actual_net_additions:.*$/m, "actual_net_additions: 0");
  write(gatePrep.repo, adrPath, reset);
  const actual = stats(gatePrep.repo, B2A2_BASELINE);
  write(gatePrep.repo, adrPath, reset.replace("actual_files: 0", `actual_files: ${actual.files}`).replace("actual_net_additions: 0", `actual_net_additions: ${actual.net}`));
  return { repo: gatePrep.repo, base: B2A2_BASELINE, head: commit(gatePrep.repo, "incremental G0 revision") };
}
function namedWorkflowShell(workflowPath, stepName) {
  const lines = readFileSync(workflowPath, "utf8").split(/\r?\n/);
  const named = lines.findIndex((line) => line.trim() === `- name: ${stepName}`);
  const nextStep = lines.findIndex((line, index) => index > named && line.trim().startsWith("- name: "));
  const runLine = lines.findIndex((line, index) => index > named && (nextStep < 0 || index < nextStep) && line.trim() === "run: |");
  assert.ok(named >= 0 && runLine > named, `${stepName} workflow shell not found`);
  const indent = lines[runLine].match(/^\s*/)[0].length + 2, body = [];
  for (let index = runLine + 1; index < lines.length; index += 1) {
    const line = lines[index], width = line.match(/^\s*/)[0].length;
    if (line.trim() && width < indent) break;
    body.push(line.trim() ? line.slice(indent) : "");
  }
  return body.join("\n");
}
function evidenceWorkflowShell() { return namedWorkflowShell(WORKFLOW, "Verify G0 evidence parent runs"); }
function runEvidenceWorkflowShell({ mutateField = "", mutateValue = "", repository = "example/repo" } = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), "rp02b2a-evidence-gh-")), fakeGh = resolve(directory, "gh"), gitRepo = resolve(directory, "repo");
  mkdirSync(gitRepo);
  sh(gitRepo, ["git", "init", "-q"]);
  sh(gitRepo, ["git", "config", "user.email", "rp02b2a@example.test"]);
  sh(gitRepo, ["git", "config", "user.name", "RP02B2a Evidence"]);
  for (const file of [".github/workflows/rp01a-e2e.yml", ".github/workflows/rp01b-dom.yml", ".github/workflows/rp01c-fixtures.yml", ".github/workflows/remediation-governance.yml"]) write(gitRepo, file, `name: ${file}\n`);
  const parent = commit(gitRepo, "accepted G0");
  sh(gitRepo, ["git", "commit", "-q", "--allow-empty", "-m", "E1 evidence"]);
  const head = sh(gitRepo, ["git", "rev-parse", "HEAD"]).trim();
  writeFileSync(fakeGh, `#!/usr/bin/env node
const args = process.argv.slice(2);
const runJq = "[.name,.path,.workflow_id,.event,.head_sha,.status,.conclusion] | @tsv";
const workflowJq = "[.id,.path] | @tsv";
const runPrefix = "repos/example/repo/actions/runs/";
const workflowPrefix = "repos/example/repo/actions/workflows/";
const names = {30000001:"RP-01A backend E2E",30000002:"RP-01B admin DOM tests",30000003:"RP-01C deterministic fixtures",30000004:"Remediation governance"};
const paths = {30000001:".github/workflows/rp01a-e2e.yml",30000002:".github/workflows/rp01b-dom.yml",30000003:".github/workflows/rp01c-fixtures.yml",30000004:".github/workflows/remediation-governance.yml"};
const workflowIds = {"rp01a-e2e.yml":"40000001","rp01b-dom.yml":"40000002","rp01c-fixtures.yml":"40000003","remediation-governance.yml":"40000004"};
if (args.length !== 4 || args[0] !== "api" || args[2] !== "--jq") { console.error("fake gh request shape mismatch"); process.exit(40); }
if (!args[1]?.startsWith("repos/example/repo/")) { console.error("fake gh repository mismatch"); process.exit(42); }
if (args[1]?.startsWith(workflowPrefix) && args[3] === workflowJq) {
  const file = args[1].slice(workflowPrefix.length), id = workflowIds[file];
  if (!id) { console.error("fake gh workflow lookup mismatch"); process.exit(41); }
  const repositoryPath = file === "rp01b-dom.yml" && process.env.FAKE_GH_MUTATE_FIELD === "repository_path" ? process.env.FAKE_GH_MUTATE_VALUE : ".github/workflows/" + file;
  process.stdout.write([id, repositoryPath].join("\\t") + "\\n");
  process.exit(0);
}
const id = args[1]?.startsWith(runPrefix) ? args[1].slice(runPrefix.length) : "";
if (!/^[1-9][0-9]+$/.test(id) || args[3] !== runJq) { console.error("fake gh run schema mismatch"); process.exit(40); }
if (!names[id]) { console.error("fake gh unknown run"); process.exit(41); }
const file = paths[id].split("/").at(-1);
const values = {name:names[id],path:paths[id] + "@refs/heads/main",workflow_id:workflowIds[file],event:"push",head_sha:process.env.FAKE_GH_PARENT,status:"completed",conclusion:"success"};
if (id === "30000002" && process.env.FAKE_GH_MUTATE_FIELD) values[process.env.FAKE_GH_MUTATE_FIELD] = process.env.FAKE_GH_MUTATE_VALUE;
process.stdout.write([values.name,values.path,values.workflow_id,values.event,values.head_sha,values.status,values.conclusion].join("\\t") + "\\n");
`);
  chmodSync(fakeGh, 0o755);
  return spawnSync("bash", ["-c", evidenceWorkflowShell()], { cwd: gitRepo, encoding: "utf8", env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, GH_TOKEN: "test", GITHUB_REPOSITORY: repository, B2A_BASE_SHA: parent, B2A_HEAD_SHA: head, EVIDENCE_PARENT: parent, EVIDENCE_RUNS: "rp01a:30000001,rp01b:30000002,rp01c:30000003,governance:30000004", FAKE_GH_PARENT: parent, FAKE_GH_MUTATE_FIELD: mutateField, FAKE_GH_MUTATE_VALUE: mutateValue } });
}
function runTrustedContextWorkflowShell(overrides = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), "rp02b2a-current-run-gh-")), fakeGh = resolve(directory, "gh"), trusted = resolve(directory, "trusted"), output = resolve(directory, "github-output");
  mkdirSync(trusted);
  sh(trusted, ["git", "init", "-q"]);
  sh(trusted, ["git", "config", "user.email", "rp02b2a@example.test"]);
  sh(trusted, ["git", "config", "user.name", "RP02B2a Admission"]);
  write(trusted, "trusted.txt", "trusted\n");
  const gateSource = commit(trusted, "trusted gate source"), workflowPath = ".github/workflows/rp02b2a-admission.yml", eventRef = overrides.eventRef ?? "refs/heads/main";
  writeFileSync(output, "");
  writeFileSync(fakeGh, `#!/usr/bin/env node
const args = process.argv.slice(2), runJq = "[.id,.run_attempt,.workflow_id,.path,.event,.head_sha] | @tsv";
if (args.length === 4 && args[0] === "api" && args[1] === "repos/example/repo" && args[2] === "--jq" && args[3] === ".default_branch") {
  process.stdout.write(process.env.FAKE_DEFAULT_BRANCH + "\\n");
} else if (args.length === 4 && args[0] === "api" && args[1] === "repos/example/repo/actions/runs/50000001" && args[2] === "--jq" && args[3] === runJq) {
  process.stdout.write([process.env.FAKE_RUN_ID,process.env.FAKE_RUN_ATTEMPT,process.env.FAKE_WORKFLOW_ID,process.env.FAKE_WORKFLOW_PATH,process.env.FAKE_EVENT,process.env.FAKE_HEAD].join("\\t") + "\\n");
} else {
  console.error("fake trusted-context gh request mismatch");
  process.exit(40);
}
`);
  chmodSync(fakeGh, 0o755);
  const env = {
    ...process.env,
    PATH: `${directory}:${process.env.PATH}`,
    GH_TOKEN: "test",
    GITHUB_OUTPUT: output,
    GITHUB_REPOSITORY: overrides.repository ?? "example/repo",
    RUN_ID: "50000001",
    RUN_ATTEMPT: "2",
    EVENT_NAME: "pull_request_target",
    WORKFLOW_PATH: workflowPath,
    WORKFLOW_SHA: gateSource,
    WORKFLOW_REF: overrides.workflowRef ?? `example/repo/${workflowPath}@${eventRef}`,
    EVENT_REF: eventRef,
    PR_NUMBER: "42",
    PR_BASE_REF: overrides.prBaseRef ?? "main",
    PR_BASE_SHA: "a".repeat(40),
    PR_HEAD_SHA: "b".repeat(40),
    GATE_SOURCE_SHA: overrides.gateSourceSha ?? gateSource,
    G0_EVIDENCE_SHA: overrides.g0EvidenceSha ?? "c".repeat(40),
    AUTHORIZED_PACKAGE_ID: "RP-02B2a2",
    AUTHORIZED_PREDECESSOR_SHA: "d".repeat(40),
    FAKE_RUN_ID: overrides.apiRunId ?? "50000001",
    FAKE_RUN_ATTEMPT: overrides.apiRunAttempt ?? "2",
    FAKE_WORKFLOW_ID: overrides.workflowId ?? "40000001",
    FAKE_WORKFLOW_PATH: overrides.path ?? `${workflowPath}@${eventRef}`,
    FAKE_EVENT: overrides.event ?? "pull_request_target",
    FAKE_HEAD: overrides.head ?? gateSource,
    FAKE_DEFAULT_BRANCH: overrides.defaultBranch ?? "main",
  };
  const result = spawnSync("bash", ["-c", namedWorkflowShell(ADMISSION_WORKFLOW, "Validate trusted event context")], { cwd: directory, encoding: "utf8", env });
  return { ...result, githubOutput: readFileSync(output, "utf8") };
}
function runAdmissionEvidenceWorkflowShell(overrides = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), "rp02b2a-live-pr-gh-")), fakeGh = resolve(directory, "gh"), output = resolve(directory, "github-output"), runnerTemp = resolve(directory, "runner");
  const prBase = overrides.prBase ?? "a".repeat(40), prHead = overrides.prHead ?? "b".repeat(40);
  mkdirSync(runnerTemp);
  writeFileSync(output, "");
  writeFileSync(fakeGh, `#!/usr/bin/env node
const args = process.argv.slice(2), jq = "[.number,.state,.base.ref,.base.sha,.head.sha] | @tsv";
if (args.length !== 4 || args[0] !== "api" || args[1] !== "repos/example/repo/pulls/42" || args[2] !== "--jq" || args[3] !== jq) { console.error("fake live-PR gh request mismatch"); process.exit(40); }
process.stdout.write([process.env.FAKE_PR_NUMBER,process.env.FAKE_PR_STATE,process.env.FAKE_BASE_REF,process.env.FAKE_BASE,process.env.FAKE_HEAD].join("\\t") + "\\n");
`);
  chmodSync(fakeGh, 0o755);
  const env = {
    ...process.env,
    PATH: `${directory}:${process.env.PATH}`,
    GH_TOKEN: "test",
    GITHUB_OUTPUT: output,
    RUNNER_TEMP: runnerTemp,
    GITHUB_REPOSITORY: "example/repo",
    RUN_ID: "50000001",
    RUN_ATTEMPT: "2",
    EVENT_NAME: "pull_request_target",
    WORKFLOW_PATH: ".github/workflows/rp02b2a-admission.yml",
    WORKFLOW_ID: "40000001",
    WORKFLOW_SHA: "e".repeat(40),
    PR_NUMBER: "42",
    PR_BASE_REF: "main",
    PR_BASE_SHA: prBase,
    PR_HEAD_SHA: prHead,
    GATE_SOURCE_SHA: "f".repeat(40),
    G0_EVIDENCE_SHA: "c".repeat(40),
    AUTHORIZED_PACKAGE_ID: "RP-02B2a2",
    AUTHORIZED_PREDECESSOR_SHA: "d".repeat(40),
    CANDIDATE_SHA: prHead,
    PACKAGE_ID: "RP-02B2a2",
    GATE_G0_EVIDENCE_SHA: "c".repeat(40),
    G0_EVIDENCE_DIGEST: "1".repeat(64),
    MANIFEST_DIGEST: overrides.manifestDigest ?? "2".repeat(64),
    GATE_EVENT_BASE_SHA: prBase,
    TEST_COMMAND: "test:rp02b2a2",
    FAKE_PR_NUMBER: overrides.liveNumber ?? "42",
    FAKE_PR_STATE: overrides.liveState ?? "open",
    FAKE_BASE_REF: overrides.liveBaseRef ?? "main",
    FAKE_BASE: overrides.liveBase ?? prBase,
    FAKE_HEAD: overrides.liveHead ?? prHead,
  };
  const result = spawnSync("bash", ["-c", namedWorkflowShell(ADMISSION_WORKFLOW, "Bind admission evidence")], { cwd: directory, encoding: "utf8", env });
  return { ...result, githubOutput: readFileSync(output, "utf8"), artifactPath: resolve(runnerTemp, "rp02b2a-admission/admission.json") };
}
function mutateCandidateBlob(item, path = "packages/shared/src/api.ts") {
  write(item.repo, path, `${readFileSync(resolve(item.repo, path), "utf8").trimEnd()}\nmutated candidate blob\n`);
  const adrPath = ORACLE[item.packageId][1];
  for (let pass = 0; pass < 2; pass += 1) {
    const actual = stats(item.repo, item.base), text = readFileSync(resolve(item.repo, adrPath), "utf8")
      .replace(/^actual_files:.*$/m, `actual_files: ${actual.files}`)
      .replace(/^actual_net_additions:.*$/m, `actual_net_additions: ${actual.net}`);
    write(item.repo, adrPath, text);
  }
  item.head = commit(item.repo, "mutate candidate manifest blob");
  return item;
}

describe("RP-02B2a2 G0 evidence publication gate", () => {
  it("accepts exactly one direct three-document E1 and binds its parent runs", () => {
    const item = prepareEvidence(), passed = gate(item);
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, /RP-02B2a2-G0-E1 package gate passed: files=3/);
    const output = run(item.repo, ["--github-output", "--base", item.base, "--head", item.head]);
    assert.equal(output.status, 0, output.stderr);
    assert.match(output.stdout, /package_id=RP-02B2a2-G0-E1/);
    assert.match(output.stdout, /test_command=test:governance/);
    assert.match(output.stdout, new RegExp(`evidence_parent=${item.base}`));
    assert.match(output.stdout, /evidence_runs=rp01a:30000001,rp01b:30000002,rp01c:30000003,governance:30000004/);
    const range = pushRange(item.repo, "ignored-main", item.base, item.head);
    assert.equal(range.status, 0, range.stderr);
    assert.match(range.stdout, new RegExp(`base=${item.base}\\nhead=${item.head}`));
    assert.equal(workflow(WORKFLOW, ["--package-id", GATE_PREP_EVIDENCE_ID, "--test-command", GATE_PREP_EVIDENCE_COMMAND]).status, 0);
  });
  it("rejects incomplete, expanded, inconsistent, forged, stale, or topologically invalid E1 evidence", () => {
    const analysis = { files: GATE_PREP_EVIDENCE_FILES, adrTextByPath: {}, base: "a".repeat(40), head: "b".repeat(40) };
    assert.equal(analyzePackageGate({ ...analysis, addedLines: 64, deletedLines: 0, netAdditions: 64 }).packageId, GATE_PREP_EVIDENCE_ID);
    assert.equal(analyzePackageGate({ ...analysis, addedLines: 64, deletedLines: 16, netAdditions: 48 }).packageId, GATE_PREP_EVIDENCE_ID);
    assert.throws(() => analyzePackageGate({ ...analysis, addedLines: 65, deletedLines: 1, netAdditions: 64 }), /additions budget exceeded/);
    assert.throws(() => analyzePackageGate({ ...analysis, addedLines: 64, deletedLines: 17, netAdditions: 47 }), /deletions budget exceeded/);
    assert.throws(() => analyzePackageGate({ ...analysis, addedLines: 64, deletedLines: 0, netAdditions: 65 }), /net additions budget exceeded/);
    const cases = [
      [{ files: GATE_PREP_EVIDENCE_FILES.slice(0, 2) }, /requires exactly the three frozen evidence files/],
      [{ extraFile: "outside/evidence.md" }, /requires exactly the three frozen evidence files/],
      [{ appendOnly: true }, /must replace the current progress block|must remove residual pending or stale G0 counts|requires exactly one .* section/],
      [{ common: { g0_evidence_parent_sha: "1".repeat(40) } }, /g0_evidence_parent_sha must equal/],
      [{ common: { g0_evidence_a2_authorization: "authorized" } }, /must preserve A2 not_authorized|contradictory A2 authorization/],
      [{ common: { g0_evidence_issue_closed_count: "10/42" } }, /must preserve ledger 9\/42/],
      [{ common: { g0_evidence_rmd_task_002: "closed" } }, /must preserve ledger 9\/42/],
      [{ common: { g0_evidence_rmd_task_003: "closed" } }, /must preserve ledger 9\/42/],
      [{ common: { g0_evidence_rp01b_run: "30000001" } }, /four unique numeric parent run ids/],
      [{ common: { g0_evidence_rp01c_run: "12" } }, /four unique numeric parent run ids/],
      [{ perFile: { [GATE_PREP_EVIDENCE_FILES[0]]: { g0_evidence_governance_run: "39999999" } } }, /evidence fields must match/],
      [{ perFile: { [GATE_PREP_EVIDENCE_FILES[1]]: { g0_evidence_rp01a_run: "\n30000001" } } }, /non-empty same-line g0_evidence_rp01a_run/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "g0_evidence_rp01a_run: 39999999\n" } }, /nine-field whitelist|exactly one g0_evidence_rp01a_run/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "g0_evidence_e1_run: 39999999\n" } }, /nine-field whitelist/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "g0_evidence_e1_run = 39999999\n" } }, /nine-field whitelist/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "\n## 8. Outside evidence section\ng0_evidence_e1_run: 39999999\n" } }, /nine-field whitelist/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "g0_evidence_unlisted:\n" } }, /nine-field whitelist/],
      [{ gateCount: `${GATE_TEST_COUNT - 1}/${GATE_TEST_COUNT - 1}` }, /final package counts|stale G0 counts/],
      [{ transformByFile: { [GATE_PREP_EVIDENCE_FILES[0]]: text => moveMarkdownSectionBodyLater(text, "### MCE-RP02B2A2-G0-E1-REMOTE-ACCEPTED", "### Unrelated later event\n") } }, /evidence field set|non-empty same-line|remote-accepted event|required.*section/i],
      [{ transformByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: text => moveMarkdownSectionBodyLater(text, "## 7. 当前唯一推荐动作", "## 8. Unrelated later status\n") } }, /evidence field set|non-empty same-line|numbered-action|required.*section/i],
      [{ transformByFile: { [GATE_PREP_EVIDENCE_FILES[2]]: text => moveMarkdownSectionBodyLater(text, "### 7.3 G0 accepted code head 与远程关闭证据", "### 7.4 Unrelated later verification\n") } }, /evidence field set|non-empty same-line|final G0 evidence section|required.*section/i],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授权；not_authorized 是旧字段。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "已授权 A2，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2\n授权通过，允许进入业务实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "`A2` **已经获得授权**，但字段保持 not_authorized。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "授权 A2 开始实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 授权生效，可以开工。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已放行，可以进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已解禁，可以进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 可开工。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授<!-- inline review -->权，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A<!-- split subject -->2 已授权，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授&ZeroWidthSpace;权，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授&ZeroWidthNonJoiner;权。\n" } }, /unsupported named HTML entity|contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授<wbr>权，可进入实现。\n" } }, /unsupported rendered HTML|contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授&#60;wbr&#62;权。\n" } }, /unsupported decoded HTML|contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已解&#x3c;wbr&#x3e;禁。\n" } }, /unsupported decoded HTML|contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授&shy;权，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授\u034F权，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已授\u200B权，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 已\u202E授\u202C权，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 &#x5df2;&#x6388;&#x6743;，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 &#24050;&#25480;&#26435;，可进入实现。\n" } }, /contradictory A2 authorization statement/],
      [{ extraByFile: { [GATE_PREP_EVIDENCE_FILES[1]]: "A2 approved for implementation.\n" } }, /contradictory A2 authorization statement/],
    ];
    for (const [options, pattern] of cases) {
      const { result } = evidenceResult(options);
      expectRejected(result, pattern, `negative E1 case mismatch: ${JSON.stringify(options)}`);
    }
    expectRejected(gate(prepareCombinedGatePrepEvidence()), /cannot batch RP-02B2a2-G0-E1 publication evidence/);
    const initialG0 = prepare(GATE_PREP_ID), revisedG0 = appendGatePrepRevision(initialG0);
    expectRejected(gate(revisedG0), /must be one atomic direct child commit/);
    const revisedEvidence = publishEvidence({ repo: revisedG0.repo, head: revisedG0.head });
    expectRejected(gate(revisedEvidence), /requires its verified G0 commit as the direct base|atomic direct child/);
    const first = prepareEvidence();
    for (const file of GATE_PREP_EVIDENCE_FILES) write(first.repo, file, readFileSync(resolve(first.repo, file), "utf8").replace("g0_evidence_governance_run: 30000004", "g0_evidence_governance_run: 30000005"));
    const second = commit(first.repo, "second evidence publication");
    expectRejected(gate({ repo: first.repo, base: first.head, head: second }), /requires its verified G0 commit as the direct base|must be one direct child commit/);
    const evidenceBase = prepareEvidence(), a2OnEvidence = addMinimalB2a2Candidate(evidenceBase.repo, evidenceBase.head);
    expectRejected(gate({ repo: evidenceBase.repo, base: evidenceBase.head, head: a2OnEvidence, gateSource: evidenceBase.base, g0EvidenceSha: evidenceBase.head, authorizedPackageId: "RP-02B2a2", authorizedPredecessorSha: evidenceBase.head }), /must branch directly from the accepted G0 code head|authorized predecessor must equal the accepted G0/);
    const mergedEvidence = prepareEvidence();
    sh(mergedEvidence.repo, ["git", "checkout", "-q", "--detach", mergedEvidence.base]);
    addMinimalB2a2Candidate(mergedEvidence.repo, mergedEvidence.base);
    sh(mergedEvidence.repo, ["git", "merge", "-q", "-s", "ours", "--no-edit", mergedEvidence.head]);
    const mergedHead = sh(mergedEvidence.repo, ["git", "rev-parse", "HEAD"]).trim();
    expectRejected(gate({ repo: mergedEvidence.repo, base: mergedEvidence.base, head: mergedHead, gateSource: mergedEvidence.base, g0EvidenceSha: mergedEvidence.head, authorizedPackageId: "RP-02B2a2", authorizedPredecessorSha: mergedEvidence.base }), /history cannot touch, delete, inherit, or merge RP-02B2a2-G0-E1/);
    const revertedEvidence = prepareEvidence();
    sh(revertedEvidence.repo, ["git", "checkout", "-q", "--detach", revertedEvidence.head]);
    sh(revertedEvidence.repo, ["git", "checkout", revertedEvidence.base, "--", ...GATE_PREP_EVIDENCE_FILES]);
    commit(revertedEvidence.repo, "revert E1 evidence before A2");
    const revertedA2 = addMinimalB2a2Candidate(revertedEvidence.repo, revertedEvidence.base);
    expectRejected(gate({ repo: revertedEvidence.repo, base: revertedEvidence.base, head: revertedA2, gateSource: revertedEvidence.base, g0EvidenceSha: revertedEvidence.head, authorizedPackageId: "RP-02B2a2", authorizedPredecessorSha: revertedEvidence.base }), /history cannot touch, delete, inherit, or merge RP-02B2a2-G0-E1/);
    const touchedEvidence = prepare(GATE_PREP_ID), acceptedTouchedEvidence = publishEvidence(touchedEvidence).head, touchedPath = GATE_PREP_EVIDENCE_FILES[1];
    sh(touchedEvidence.repo, ["git", "checkout", "-q", "--detach", touchedEvidence.head]);
    write(touchedEvidence.repo, touchedPath, `${readFileSync(resolve(touchedEvidence.repo, touchedPath), "utf8")}\nTemporary evidence-file touch without E1 markers.\n`);
    commit(touchedEvidence.repo, "touch evidence file without markers");
    sh(touchedEvidence.repo, ["git", "checkout", touchedEvidence.head, "--", touchedPath]);
    commit(touchedEvidence.repo, "restore evidence file before A2");
    const touchedA2 = addMinimalB2a2Candidate(touchedEvidence.repo, touchedEvidence.head);
    expectRejected(gate({ repo: touchedEvidence.repo, base: touchedEvidence.head, head: touchedA2, gateSource: touchedEvidence.head, g0EvidenceSha: acceptedTouchedEvidence, authorizedPackageId: "RP-02B2a2", authorizedPredecessorSha: touchedEvidence.head }), /history cannot touch, delete, inherit, or merge RP-02B2a2-G0-E1/);
    const noG0 = repo(false);
    for (const file of GATE_PREP_EVIDENCE_FILES) write(noG0, file, evidenceText(sh(noG0, ["git", "rev-parse", "HEAD"]).trim()));
    const base = sh(noG0, ["git", "rev-parse", "HEAD"]).trim(), head = commit(noG0, "evidence without G0");
    expectRejected(gate({ repo: noG0, base, head }), /requires a verified RP-02B2a2-G0 ancestor/);
  });
  it("rejects evidence workflow permission, binding, command, ordering, and remote-run drift", () => {
    const mutations = [
      [text => text.replace("  actions: read", "  actions: write"), /permissions must be exactly/],
      [text => text.replace("      - name: Verify G0 evidence parent runs", "      - name: Disabled G0 evidence parent runs"), /step named Verify G0 evidence parent runs/],
      [text => text.replace("if: steps.b2a-package.outputs.package_id == 'RP-02B2a2-G0-E1'", "if: always()"), /evidence step condition/],
      [text => text.replace("          EVIDENCE_PARENT: ${{ steps.b2a-package.outputs.evidence_parent }}", "          EVIDENCE_PARENT: ${{ github.sha }}"), /evidence parent runs env binding/],
      [text => text.replace('          test "$status" = "completed"', '          test "$status" = "queued"'), /evidence parent runs shell semantics/],
      [text => text.replace("      - run: npm ci\n", "").replace("      - name: Verify G0 evidence parent runs", "      - run: npm ci\n      - name: Verify G0 evidence parent runs"), /step sequence contains missing, extra, or reordered execution|evidence verification must complete before npm ci/],
      [text => text.replace("    runs-on: ubuntu-latest", "    if: false\n    runs-on: ubuntu-latest"), /job keys mismatch/],
      [text => text.replace("    runs-on: ubuntu-latest", "    continue-on-error: true\n    runs-on: ubuntu-latest"), /job keys mismatch/],
      [text => text.replace("      - run: npm ci", "      - run: echo unexpected\n      - run: npm ci"), /step sequence contains missing, extra, or reordered execution/],
      [text => `${text}\n  bypass-job:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n`, /workflow jobs keys mismatch/],
    ];
    for (const [index, [change, pattern]] of mutations.entries()) {
      const result = mutate(change, `E1 workflow mutation ${index} did not change fixture`);
      assert.notEqual(result.status, 0, `E1 workflow mutation ${index} passed`);
      expectRejected(result, pattern, `E1 workflow mutation ${index}`);
    }
    const success = runEvidenceWorkflowShell();
    assert.equal(success.status, 0, `${success.stdout}\n${success.stderr}`);
    expectRejected(runEvidenceWorkflowShell({ repository: "other/repo" }), /repository mismatch/i);
    for (const [field, value, pattern] of [
      ["repository_path", ".github/workflows/wrong.yml", /repository.*path|workflow.*repository path/i],
      ["name", "Wrong workflow", /workflow name/i],
      ["path", ".github/workflows/wrong.yml@refs/heads/main", /workflow path/i],
      ["workflow_id", "49999999", /workflow id/i],
      ["event", "pull_request", /event/i],
      ["head_sha", "b".repeat(40), /head/i],
      ["status", "queued", /status/i],
      ["conclusion", "failure", /conclusion/i],
    ]) expectRejected(runEvidenceWorkflowShell({ mutateField: field, mutateValue: value }), pattern, `fake gh ${field} drift`);
  });
  it("accepts a direct-child amend worktree but rejects incremental G0 worktree history", () => {
    const item = prepare(GATE_PREP_ID);
    const implementationPath = "docs/modules/rp-02b2-dispatcher-transport-implementation-package.md";
    const implementation = readFileSync(resolve(item.repo, implementationPath), "utf8");
    write(item.repo, implementationPath, implementation.replace("当前未提交差异为", "当前待冻结差异为"));
    const amendWorktree = run(item.repo, ["--base", B2A2_BASELINE, "--head", item.head, "--worktree"]);
    assert.equal(amendWorktree.status, 0, amendWorktree.stderr);
    const incrementalHead = commit(item.repo, "incremental G0 worktree");
    expectRejected(
      run(item.repo, ["--base", B2A2_BASELINE, "--head", incrementalHead, "--worktree"]),
      /worktree preparation must be at fixed baseline .* or its single direct child pending atomic amend/
    );
  });
});
