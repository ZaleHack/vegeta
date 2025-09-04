"""
Command-line tool to query Orange's prepaid search endpoint.

Prompts for an "Identificateur Orange" number, then submits the form
and prints the full HTML response returned by the server.

Dependencies: requests, beautifulsoup4
"""

import requests
from bs4 import BeautifulSoup

URL = "https://prepaid.orange.sn/recherche.aspx"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Content-Type": "application/x-www-form-urlencoded",
}

def identify_orange(msisdn: str) -> str:
    """Submit a lookup for the given number and return the response HTML."""
    session = requests.Session()

    # Initial GET to fetch dynamic form tokens and cookies
    resp = session.get(URL, headers=HEADERS)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    viewstate = soup.find("input", {"id": "__VIEWSTATE"})["value"]
    eventvalidation = soup.find("input", {"id": "__EVENTVALIDATION"})["value"]
    viewstategenerator = soup.find("input", {"id": "__VIEWSTATEGENERATOR"})["value"]

    payload = {
        "__EVENTTARGET": "",
        "__EVENTARGUMENT": "",
        "__VIEWSTATE": viewstate,
        "__VIEWSTATEGENERATOR": viewstategenerator,
        "__EVENTVALIDATION": eventvalidation,
        "ctl00$ContentPlaceHolder1$numeroCompteTextBox": "",
        "ctl00$ContentPlaceHolder1$msisdnTextBox": msisdn,
        "ctl00$ContentPlaceHolder1$simTextBox": "",
        "ctl00$ContentPlaceHolder1$nomTextBox": "",
        "ctl00$ContentPlaceHolder1$prenomTextBox": "",
        "ctl00$ContentPlaceHolder1$paysDropDownList_pm": "-1",
        "ctl00$ContentPlaceHolder1$dateNaissanceTextBox": "",
        "ctl00$ContentPlaceHolder1$rechercherButton": "Rechercher",
    }

    post_resp = session.post(URL, headers=HEADERS, data=payload)
    post_resp.raise_for_status()
    return post_resp.text

if __name__ == "__main__":
    msisdn = input("Identificateur Orange (default 777304545): ") or "777304545"
    result_html = identify_orange(msisdn)
    print("=== Response ===")
    print(result_html)
