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

    const size = head.headers["content-length"];
    const dispo = head.headers["content-disposition"];

    let name = url.split("/").pop().split("?")[0] || "Unknown";

    if(dispo){
      const m = dispo.match(/filename="?(.+?)"?$/);
      if(m) name = m[1];
    }

    res.json({
      fileName: decodeURIComponent(name),
      fileSize: format(size),
      contentType: head.headers["content-type"]
    });

  }catch{
    res.status(500).json({ error:"Failed to fetch file info" });
  }
}
