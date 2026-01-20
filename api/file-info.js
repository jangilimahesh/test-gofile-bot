import axios from "axios";

function format(bytes){
  if(!bytes) return "Unknown";
  const u=["B","KB","MB","GB","TB"];
  const i=Math.floor(Math.log(bytes)/Math.log(1024));
  return (bytes/1024**i).toFixed(2)+" "+u[i];
}

export default async function handler(req,res){
  const { url } = req.query;
  if(!url) return res.status(400).json({ error:"URL required" });

  try{
    const head = await axios.head(url, {
      maxRedirects: 5,
      validateStatus: () => true
    });

    const type = head.headers["content-type"];
    if(type?.includes("text/html")){
      return res.status(400).json({ error:"Not a direct download link" });
    }

    let name = url.split("/").pop().split("?")[0];
    const dispo = head.headers["content-disposition"];
    if(dispo){
      const m = dispo.match(/filename="?(.+?)"?$/);
      if(m) name = m[1];
    }

    res.json({
      fileName: decodeURIComponent(name),
      fileSize: format(head.headers["content-length"]),
      contentType: type
    });

  }catch{
    res.status(500).json({ error:"Failed to fetch file info" });
  }
}