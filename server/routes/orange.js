import express from 'express';

const router = express.Router();

const URL = 'https://prepaid.orange.sn/recherche.aspx';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  'Content-Type': 'application/x-www-form-urlencoded'
};

router.post('/identify', async (req, res) => {
  const { msisdn } = req.body;
  if (!msisdn) {
    return res.status(400).json({ error: 'msisdn is required' });
  }
  try {
    const getResp = await fetch(URL, { headers: HEADERS });
    const getHtml = await getResp.text();

    const viewstateMatch = getHtml.match(/id="__VIEWSTATE" value="([^"]+)"/);
    const eventvalidationMatch = getHtml.match(/id="__EVENTVALIDATION" value="([^"]+)"/);
    const viewstategeneratorMatch = getHtml.match(/id="__VIEWSTATEGENERATOR" value="([^"]+)"/);
    if (!viewstateMatch || !eventvalidationMatch || !viewstategeneratorMatch) {
      return res.status(500).json({ error: 'Token extraction failed' });
    }

    const params = new URLSearchParams({
      '__EVENTTARGET': '',
      '__EVENTARGUMENT': '',
      '__VIEWSTATE': viewstateMatch[1],
      '__VIEWSTATEGENERATOR': viewstategeneratorMatch[1],
      '__EVENTVALIDATION': eventvalidationMatch[1],
      'ctl00$ContentPlaceHolder1$numeroCompteTextBox': '',
      'ctl00$ContentPlaceHolder1$msisdnTextBox': msisdn,
      'ctl00$ContentPlaceHolder1$simTextBox': '',
      'ctl00$ContentPlaceHolder1$nomTextBox': '',
      'ctl00$ContentPlaceHolder1$prenomTextBox': '',
      'ctl00$ContentPlaceHolder1$paysDropDownList_pm': '-1',
      'ctl00$ContentPlaceHolder1$dateNaissanceTextBox': '',
      'ctl00$ContentPlaceHolder1$rechercherButton': 'Rechercher'
    });

    const postResp = await fetch(URL, {
      method: 'POST',
      headers: HEADERS,
      body: params.toString()
    });
    const html = await postResp.text();
    res.json({ html });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

export default router;
