/* Chrome print-dialog job transport. */
(function(root){
 const BROWSER='__browser__';
 function create({label,chrome}) {
  return {async print(_printer,job) {
   const {size}=job, copies=Number(job.copies);
   if(!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width<=0 || size.height<=0) throw new Error('Invalid label dimensions');
   if(!Number.isInteger(copies)||copies<1||copies>99) throw new Error('Copies must be between 1 and 99');
   const rotation=[90,180,270].includes(Number(job.rotation))?Number(job.rotation):0;
   const canvas=label.renderLabel(job.part,{widthIn:size.width,heightIn:size.height,padIn:.06,leftPadIn:.1,image:job.image,layout:job.layout,elements:job.elements,rotation,invert:!!job.invert});
   const id=root.crypto.randomUUID(),key='printJob:'+id,sideways=rotation%180!==0;
   await chrome.storage.session.set({[key]:{dataUrl:canvas.toDataURL('image/png'),widthIn:sideways?size.height:size.width,heightIn:sideways?size.width:size.height,copies,title:job.part.partNumber}});
   try {await chrome.tabs.create({url:chrome.runtime.getURL('print.html')+'?job='+id});}
   catch(e){await chrome.storage.session.remove(key);throw e;}
   return {backend:'browser'};
  }};
 }
 const api={create,BROWSER};root.McmPrinting=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
