import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

const URL = 'https://prepaid.orange.sn/recherche.aspx';
const BASE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  'Content-Type': 'application/x-www-form-urlencoded',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,' +
    'image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  Origin: 'https://prepaid.orange.sn',
  Referer: 'https://prepaid.orange.sn/recherche.aspx'
};

router.post('/identify', authenticate, async (req, res) => {
  const { msisdn } = req.body;
  if (!msisdn) {
    return res.status(400).json({ error: 'msisdn is required' });
  }
  try {
    const getResp = await fetch(URL, { headers: BASE_HEADERS });
    const getHtml = await getResp.text();
    const cookieHeader = (getResp.headers.getSetCookie?.() || [])
      .map((c) => c.split(';')[0])
      .join('; ');

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
      headers: { ...BASE_HEADERS, Cookie: cookieHeader },
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
