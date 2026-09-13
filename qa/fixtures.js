// Test-only data, served exclusively by the isolated QA development server.
document.body.style.display = '';
const fixtureUser = {uid:'sample-user',getIdToken:async()=>{throw Error('Production tokens unavailable in QA');}};
const settings = {platformFeeRate:0.1,processingFeeAmount:100,
  bankDetails:{name:'Example bank',accountName:'Test business',accountNumber:'0000000000'}};
const values = {
  bankOrders:{title:'Sample design template',sellerId:'sample-seller',userId:'sample-user',total:1200,sellerCreditMinor:100000,status:'pending',settlementStatus:'held'},
  bankPurchases:{title:'Sample design template',filePaths:['sample-file'],status:'paid'},
  bankLedger:{sellerId:'sample-seller',receivedMinor:120000,sellerMinor:100000,commissionMinor:10000,processingMinor:10000},
  bankDisputes:{reason:'Sample customer reports missing files'},
  sellerBalances:{heldMinor:100000,reservedMinor:20000,paidMinor:30000},
};
function reference(path='') {
  const data = path.includes('platformSettings') ? settings :
    Object.entries(values).find(([key])=>path.includes(key))?.[1] || {};
  const snap = {id:'sample-order',exists:!path.includes('bankPayouts') && !path.includes('bankDisputeReports'),data:()=>data};
  return {
    collection:name=>reference(path+'/'+name),doc:name=>reference(path+'/'+name),
    where:()=>reference(path),orderBy:()=>reference(path),limit:()=>reference(path),
    get:async()=>snap,
    onSnapshot:callback=>{queueMicrotask(()=>callback(path.includes('sellerBalances') ? snap : {empty:false,docs:[snap]}));return ()=>{};},
    set:async()=>{throw Error('Preview only: saving disabled');}
  };
}
window.db=reference();
window.auth={currentUser:fixtureUser,onAuthStateChanged:callback=>{queueMicrotask(()=>callback(fixtureUser));return ()=>{};}};
window.firebase={auth:()=>window.auth,firestore:Object.assign(()=>window.db,{FieldValue:{serverTimestamp:()=>0}})};
window.bankOrderCall=async()=>{throw Error('Preview only: server actions disabled');};
window.DigitaskBankFees={settings:()=>({})};
