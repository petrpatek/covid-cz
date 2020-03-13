const Apify = require('apify');
const toNumber = (str) => {
    return parseInt(str.replace(",", ""))
};

Apify.main(async () => {
    const input = await Apify.getInput();
    const url = "https://datastudio.google.com/embed/reporting/d0af39ad-3513-4ab9-a202-4afed1f786e2/page/DzlHB";

    console.log('Launching Puppeteer...');

    const browser = await Apify.launchPuppeteer({headless: false, defaultViewport: {height: 1080, width: 1920}, useChrome: true});

    console.log(`Getting data from ${url}...`);
    const page = await browser.newPage();
    await Apify.utils.puppeteer.injectJQuery(page);
    await page.goto(url, {waitUntil: "networkidle0"});
    let kvStore = await Apify.openKeyValueStore("COVID-19-CZECH");

    await page.waitFor(() => $("kpimetric:contains(Celkový počet testovaných)"));
    page.on("console", (log) => console.log(log.text()));
    const extractedData = await page.evaluate(() => {
        const totalTested = $("div.kpi-label:contains(Celkový počet testovaných)").next().text().trim();
        const infected = $("div.kpi-label:contains(Aktuální počet infikovaných)").next().text().trim();
        const lastUpdated = $("font:contains(Poslední aktualizace)").text().trim();
        const testedSubjectGraph = document.querySelector("#_ABSTRACT_RENDERER_ID_2").parentElement;
        const values = Array.from(testedSubjectGraph.children[2].querySelectorAll('text[font-size="14"]'));
        const dates = Array.from(testedSubjectGraph.children[2].querySelectorAll('text[transform]'));
        const parts = lastUpdated.replace("Poslední aktualizace ", "").split("v");
        const splited = parts[0].split(".");
        let lastUpdatedParsed = new Date(`${splited[1]}.${splited[0]}.${splited[2]} ${parts[1]}`).toISOString();

        return {
            totalTested,
            infected,
            values: values.map(value => value.textContent),
            dates: dates.map(date => date.textContent),
            lastUpdated: lastUpdatedParsed
        }
    });
    let startDate  = new Date(extractedData.dates[0].replace("20…", "2020"));
    startDate = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() ));

    let graphData = extractedData.values.map((value, index) => ({value, date: new Date( startDate.getTime()+ (24*60*60*1000) * index)}));

    console.log(`Saving data.`);
    const data = {
        totalTested: toNumber(extractedData.totalTested),
        infected: toNumber(extractedData.infected),
        testedCases: graphData,
        sourceUrl: url,
        lastUpdatedAtSource: extractedData.lastUpdated,
        lastUpdatedAtApify: new Date(),
        readMe: "https://apify.com/petrpatek/covid-cz",
    };

    await kvStore.setValue("LATEST", data);
    await Apify.pushData(data);

    console.log('Closing Puppeteer...');
    await browser.close();

    console.log('Done.');
});
