const Apify = require('apify');
const toNumber = (str)=>{
    return parseInt(str.replace(",", ""))
}
Apify.main(async () => {
    const input = await Apify.getInput();
    const url = "https://datastudio.google.com/embed/reporting/d0af39ad-3513-4ab9-a202-4afed1f786e2/page/DzlHB";
    console.log('Launching Puppeteer...');
    const browser = await Apify.launchPuppeteer({headless: true, launchPuppeteerOptions: {useApifyProxy: true}});

    console.log(`Getting data from ${url}...`);
    const page = await browser.newPage();
    await Apify.utils.puppeteer.injectJQuery(page);
    await page.goto(url, {waitUntil: "networkidle0"});
    let dataset = await Apify.openDataset("COVID-19-CZECH");
    await dataset.drop();
    dataset = await Apify.openDataset("COVID-19-CZECH");


    await page.waitFor(() => $("kpimetric:contains(Celkový počet testovaných)"));
    page.on("console", (log) => console.log(log.text()));
    const extractedData = await page.evaluate(() => {
        const totalTested = $("div.kpi-label:contains(Celkový počet testovaných)").next().text().trim();
        const infected = $("div.kpi-label:contains(Aktuální počet infikovaných)").next().text().trim();
        const lastUpdated = $("font:contains(Poslední aktualizace)").text().trim();
        const testedSubjectGraph = document.querySelector("#_ABSTRACT_RENDERER_ID_2").parentElement;
        const values = Array.from(testedSubjectGraph.children[2].querySelectorAll('text[font-size="14"]'));
        const dates = Array.from(testedSubjectGraph.children[2].querySelectorAll('text[transform]'));

        return {
            totalTested,
            infected,
            values: values.map(value => value.textContent),
            dates: dates.map(date => date.textContent),
            lastUpdated
        }
    });
    let lastUpdatedParsed = new Date(extractedData.lastUpdated.replace("Poslední aktualizace ", "").split("v").join(" ")).toISOString();
    let graphData = extractedData.values.map((value, index) => ({value, date: new Date(extractedData.dates[0])}));

    console.log(`Saving data.`);
    const data = {totalTested:toNumber(extractedData.totalTested), infected: toNumber(extractedData.infected), lastUpdated: lastUpdatedParsed};

    await dataset.pushData(data);
    await Apify.pushData(dataset);

    console.log('Closing Puppeteer...');
    await browser.close();

    console.log('Done.');
});
