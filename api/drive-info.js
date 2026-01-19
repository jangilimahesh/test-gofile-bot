import axios from "axios";

function extractFileId(url) {
  const m =
    url.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/id=([a-zA-Z0-9_-]+)/);
  return m ? (m[1] || m[2]) : null;
}

function format(bytes){
  if(!bytes) return "Unknown";
  const u=["B","KB","MB","GB","TB"];
  const i=Math.floor(Math.log(bytes)/Math.log(1024));
  return (bytes/1024**i).toFixed(2)+" "+u[i];
}

export default async function handler(req,res){
  const fileId = extractFileId(req.query.url);
  if(!fileId) return res.status(400).json({error:"Invalid Drive link"});

  try{
    const head = await axios.head(
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      { maxRedirects: 5 }
    );

    const size = head.headers["content-length"];
    const disp = head.headers["content-disposition"];

    let name = "Unknown file";
    if(disp){
      const m = disp.match(/filename="(.+?)"/);
      if(m) name = m[1];
    }

    res.json({
      fileName: name,
      fileSize: format(size)
    });

  }catch{
    res.status(500).json({error:"Unable to fetch info"});
  }
}