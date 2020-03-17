const Apify = require('apify');
const cheerio = require("cheerio");
const getDataFromIdnes = require("./idnes");
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
};

const LATEST = "LATEST";

Apify.main(async () => {
    const kvStore = await Apify.openKeyValueStore("COVID-19-CZECH");
    const dataset = await Apify.openDataset("COVID-19-CZECH-HISTORY");

    const response = await Apify.utils.requestAsBrowser({
        url: "https://onemocneni-aktualne.mzcr.cz/covid-19",
        proxyUrl: Apify.getApifyProxyUrl({groups: ["CZECH_LUMINATI"]}
        )
    });
    const $ = await cheerio.load(response.body);
    const url = $("#covid-content").attr("data-report-url");
    const totalTested = $("#count-test").text().trim();
    const infected = $("#count-sick").text().trim();
    const recovered = $("#count-recover").text().trim();
    const lastUpdated = $(".pr-15").eq(0).text().trim().replace("Poslední aktualizace: ", "").replace(/\u00a0/g, "");
    const parts = lastUpdated.split("v");
    const splited = parts[0].split(".");
    let lastUpdatedParsed = new Date(`${splited[1]}.${splited[0]}.${splited[2]} ${parts[1]}`);
    lastUpdatedParsed = new Date(Date.UTC(lastUpdatedParsed.getFullYear(), lastUpdatedParsed.getMonth(), lastUpdatedParsed.getDate(), lastUpdatedParsed.getHours() - 1, lastUpdatedParsed.getMinutes()));


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
    await page.goto(url, {waitUntil: "networkidle0", timeout: 60000});

    await page.waitFor(() => $("kpimetric:contains(Celkový počet provedených testů)"));
    page.on("console", (log) => console.log(log.text()));
    await Apify.utils.sleep(10000);
    const extractedData = await page.evaluate(() => {
        // Počet testovaných případů
        const testedSubjectGraph = document.querySelector('svg[width="1121"][height="275"]');
        const testedSubjectGraphValues = Array.from(testedSubjectGraph.children[2].querySelectorAll('text[font-size="14"]'));
        const testedSubjectGraphDates = Array.from(testedSubjectGraph.children[2].querySelectorAll('text[font-size="12"]'));

        // Celkový počet pozitivních případů
        const totalNumberPositiveGraph = document.querySelector('svg[width="1148"][height="289"]');
        const totalNumberPositiveGraphValues = Array.from(totalNumberPositiveGraph.children[1].querySelectorAll('text[font-size="14"]'));
        const totalNumberPositiveGraphDates = Array.from(totalNumberPositiveGraph.children[1].querySelectorAll('text[font-size="12"]'));

        // Počet testovaných případů
        const numberTestedGraph = document.querySelector('svg[width="1129"][height="313"]');
        const numberTestedGraphValues = Array.from(numberTestedGraph.children[2].querySelectorAll('text[font-size="14"]'));
        const numberTestedGraphDates = Array.from(numberTestedGraph.children[2].querySelectorAll('text[font-size="12"]'));

        const infectedByRegionGraph = document.querySelector('svg[width="610"]');
        let infectedByRegionValues;
        let infectedByRegionRegions;

        if (infectedByRegionGraph) {
            infectedByRegionValues = Array.from(infectedByRegionGraph.children[2].querySelectorAll('text[text-anchor="middle"]'));
            infectedByRegionRegions = Array.from(infectedByRegionGraph.children[2].querySelectorAll('text[text-anchor="end"]')).slice(0, 14);
        }

        return {
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
            infectedByRegionGraph: infectedByRegionGraph ? {
                values: infectedByRegionValues.map(value => value.textContent),
                regions: infectedByRegionRegions.map(value => value.textContent),
            } : null,
        }
    });

    console.log(`Processing and saving data.`);

    extractedData.numberOfTestedGraph.dates[0] = `${extractedData.numberOfTestedGraph.dates[0]} 2020`;
    extractedData.totalNumberPositiveGraph.dates[0] = `${extractedData.totalNumberPositiveGraph.dates[0]} 2020`;
    const now = new Date();
    const data = {
        totalTested: toNumber(totalTested.replace(" ", "")),
        infected: toNumber(infected.replace(" ", "")),
        recovered: toNumber(recovered.replace(" ", "")),
        testedCases: connectDataFromGraph(extractedData.testedSubjectGraph),
        totalPositiveTests: connectDataFromGraph(extractedData.totalNumberPositiveGraph),
        numberOfTestedGraph: connectDataFromGraph(extractedData.numberOfTestedGraph),
        infectedByRegion: extractedData.infectedByRegionGraph ? extractedData.infectedByRegionGraph.values.map((value, index) => ({
            value,
            region: extractedData.infectedByRegionGraph.regions[index]
        })) : null,
        sourceUrl: url,
        lastUpdatedAtSource: lastUpdatedParsed.toISOString(),
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() -1, now.getMinutes())).toISOString(),
        readMe: "https://apify.com/petrpatek/covid-cz",
    };

    // Data from idnes - They have newer numbers than MZCR...
    const idnesData = await getDataFromIdnes();
    data.fromBabisNewspapers = {
        ...idnesData
    };


    // Compare and save to history
    const latest = await kvStore.getValue(LATEST);
    delete latest.lastUpdatedAtApify;
    const actual = Object.assign({}, data);
    delete actual.lastUpdatedAtApify;

    if (JSON.stringify(latest) !== JSON.stringify(actual)) {
        await dataset.pushData(data);
    }

    await kvStore.setValue(LATEST, data);
    await Apify.pushData(data);


    console.log('Closing Puppeteer...');
    await browser.close();

    console.log('Done.');
});
