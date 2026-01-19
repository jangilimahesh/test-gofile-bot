import axios from "axios";

function extractFileId(url) {
  const m =
    url.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/id=([a-zA-Z0-9_-]+)/);
  return m ? (m[1] || m[2]) : null;
}

function driveDirect(fileId){
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

export default async function handler(req,res){
  if(req.method!=="POST")
    return res.status(405).json({error:"POST only"});

  const fileId = extractFileId(req.body.drive_url);
  if(!fileId)
    return res.status(400).json({error:"Invalid Drive link"});

  // Get Gofile server
  const server =
    (await axios.get("https://api.gofile.io/servers"))
      .data.data.servers[0].name;

  // Start remote upload
  const start = await axios.post(
    `https://${server}.gofile.io/uploadFile`,
    {
      fileUrl: driveDirect(fileId)
    }
  );

  res.json({
    jobId: start.data.data.jobId,
    server
  });
}
