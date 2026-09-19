// Register before MuPDF's asynchronous WASM initialization can yield.
self.onmessage=async ({data})=>{
  try {const {extractPage}=await import('./extract.mjs');self.postMessage({result:extractPage(new Uint8Array(data.bytes),data.page,data.kind)});}
  catch(error){self.postMessage({error:error.message});}
};
