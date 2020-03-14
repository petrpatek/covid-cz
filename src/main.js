const Apify = require('apify');
const toNumber = (str) => {
    return parseInt(str.replace(",", ""))
};
const connectDataFromGraph = (graphData) => {
    let startDate = new Date(graphData.dates[0].replace("20…", "2020"));
    startDate = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));

    return graphData.values.map((value, index) => ({
        value,
        date: new Date(startDate.getTime() + (24 * 60 * 60 * 1000) * index)
    }));
}

Apify.main(async () => {
    const input = await Apify.getInput();
    const url = "https://datastudio.google.com/embed/reporting/d0af39ad-3513-4ab9-a202-4afed1f786e2/page/DzlHB";

    console.log('Launching Puppeteer...');

    const browser = await Apify.launchPuppeteer({
        headless: false,
        defaultViewport: {height: 1080, width: 1920},
        useChrome: true,
        useApifyProxy: true,
        apifyProxyGroups: ["CZECH_LUMINATI"]
    });

    console.log(`Getting data from ${url}...`);
    const page = await browser.newPage();
    await Apify.utils.puppeteer.injectJQuery(page);
    await page.goto(url, {waitUntil: "networkidle0"});
    let kvStore = await Apify.openKeyValueStore("COVID-19-CZECH");

    await page.waitFor(() => $("kpimetric:contains(Celkový počet testovaných)"));
    page.on("console", (log) => console.log(log.text()));
    await Apify.utils.sleep(10000);
    const extractedData = await page.evaluate(() => {
        const totalTested = $("div.kpi-label:contains(Celkový počet otestovaných)").next().text().trim();
        const infected = $("div.kpi-label:contains(Aktuální počet infikovaných)").next().text().trim();
        const lastUpdated = $("font:contains(Poslední aktualizace)").text().trim();

        // Počet testovaných případů
        const testedSubjectGraph = document.querySelector("#_ABSTRACT_RENDERER_ID_2").parentElement;
        const testedSubjectGraphValues = Array.from(testedSubjectGraph.children[2].querySelectorAll('text[font-size="14"]'));
        const testedSubjectGraphDates = Array.from(testedSubjectGraph.children[2].querySelectorAll('text[transform]'));

        // Celkový počet pozitivních případů
        const totalNumberPositiveGraph = document.querySelector("#_ABSTRACT_RENDERER_ID_4").parentElement;
        const totalNumberPositiveGraphValues = Array.from(totalNumberPositiveGraph.children[1].querySelectorAll('text[font-size="14"]'));
        const totalNumberPositiveGraphDates = Array.from(testedSubjectGraph.children[2].querySelectorAll('text[transform]'));

        // Počet testovaných případů
        const numberTestedGraph = document.querySelector("#_ABSTRACT_RENDERER_ID_6").parentElement;
        const numberTestedGraphValues = Array.from(numberTestedGraph.children[2].querySelectorAll('text[font-size="14"]'));
        const numberTestedGraphDates = Array.from(numberTestedGraph.children[2].querySelectorAll('text[font-size="12"]'));


        const parts = lastUpdated.replace("Poslední aktualizace ", "").split("v");
        const splited = parts[0].split(".");
        let lastUpdatedParsed = new Date(`${splited[1]}.${splited[0]}.${splited[2]} ${parts[1]}`);
        lastUpdatedParsed = new Date(Date.UTC(lastUpdatedParsed.getFullYear(), lastUpdatedParsed.getMonth(), lastUpdatedParsed.getDate(), lastUpdatedParsed.getHours(), lastUpdatedParsed.getMinutes()));

        return {
            totalTested,
            infected,
            testedSubjectGraph: {
                values: testedSubjectGraphValues.map(value => value.textContent),
                dates: testedSubjectGraphDates.map(date => date.textContent),
            },
            totalNumberPositiveGraph: {
                values: totalNumberPositiveGraphValues.map(value => value.textContent),
                dates: totalNumberPositiveGraphDates.map(value => value.textContent)
            },
            numberOfTestedGraph: {
                values: numberTestedGraphValues.map(value => value.textContent),
                dates: numberTestedGraphDates.map(value => value.textContent),
            },
            lastUpdated: lastUpdatedParsed.toISOString(),
        }
    });

    console.log(`Saving data.`);
    console.log(extractedData.numberOfTestedGraph);
    const now = new Date();

    const data = {
        totalTested: toNumber(extractedData.totalTested),
        infected: toNumber(extractedData.infected),
        testedCases: connectDataFromGraph(extractedData.testedSubjectGraph),
        totalPositiveTests: connectDataFromGraph(extractedData.totalNumberPositiveGraph),
        //numberOfTestedGraph: connectDataFromGraph(extractedData.numberOfTestedGraph),
        sourceUrl: url,
        lastUpdatedAtSource: extractedData.lastUpdated,
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() +1, now.getMinutes())).toISOString(),
        readMe: "https://apify.com/petrpatek/covid-cz",
    };

    await kvStore.setValue("LATEST", data);
    await Apify.pushData(data);

    console.log('Closing Puppeteer...');
    await browser.close();

    console.log('Done.');
});
