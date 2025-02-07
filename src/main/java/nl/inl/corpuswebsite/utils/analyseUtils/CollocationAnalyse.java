package nl.inl.corpuswebsite.utils.analyseUtils;


import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import nl.inl.corpuswebsite.utils.analyseUtils.Alg.BayesAlg;
import nl.inl.corpuswebsite.utils.analyseUtils.Alg.EffectSizeAlg;
import nl.inl.corpuswebsite.utils.analyseUtils.Alg.TestAlg;

import java.util.*;

/**
 * ClassName: CollocationAnalyse
 * Package: nl.inl.corpuswebsite.utils.analyseUtils
 * Description: The implementation related to the Collocation feature. Here, the algorithm used comes from "wordless", see: https://github.com/BLKSerene/Wordless/blob/main/doc/doc.md#doc-12-4-4
 */
public class CollocationAnalyse {
    private String baseUrl; // base url connecting to blacklab-server, eg. http://localhost:8084/blacklab-server/
    private int aroundNumber; // the window size of the word to analyze
    private int wordNumber; // Number of Words to Show
    private Boolean isCase; // Morphological Variation
    private String corpusName; // the name of corpus
    private String stopwordsStr; // Stopwords using | as the separator, eg. "abandon|bank|car"
    private String keywordsInput; // Keyword string that input by user, eg.[word="apple|banana"&lemma="(?-i)apple|banana"&pos="NN"]
    private String testAlg; // Statistical Significance Test
    private String bayesAlg; // Bayesian Factor Algorithm
    private String effectSizeAlg; // Effect Size Algorithm

    public CollocationAnalyse(String baseUrl, int aroundNumber, int wordNumber, Boolean isCase, String corpusName, String stopwordsStr, String keywordsInput, String testAlg, String bayesAlg, String effectSizeAlg) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        this.aroundNumber = aroundNumber;
        this.wordNumber = wordNumber;
        this.isCase = isCase;
        this.corpusName = corpusName;
        this.stopwordsStr = stopwordsStr;
        this.keywordsInput = (keywordsInput != null) ? keywordsInput : "";
        this.testAlg = testAlg;
        this.bayesAlg = bayesAlg;
        this.effectSizeAlg = effectSizeAlg;
    }

    public JSONObject getColloService() throws Exception {
        String[] stopWordsArray = stopwordsStr.split("\\|");
        List<String> stopWords = Arrays.asList(stopWordsArray);
        BlacklabUtilsForAnalyse blUtils = new BlacklabUtilsForAnalyse(baseUrl);
        JSONArray colloArray = blUtils.getColloc(corpusName, isCase, stopWords, wordNumber, aroundNumber, keywordsInput);

        // The algorithm used here comes from "wordless", see: https://github.com/BLKSerene/Wordless/blob/main/doc/doc.md#doc-12-4-4
        // O₁₁: Number of occurrences of the Word 1 followed by the Word 2.
        // O₁₂: Number of occurrences of the Word 1 followed by any word except the Word 2.
        // O₂₁: Number of occurrences of any word except the Word 1 followed by the Word 2.
        // O₂₂: Number of occurrences of any word except the Word 1 followed by any word except the Word 2.
        // O₁ₓ: Total frequency of the Word 1 in the corpus.  o1x==o11+o12
        // Oₓ₁: Total frequency of the Word 2 in the corpus.  ox1==o11+o21
        // Oₓₓ: Size of the corpus.  oxx==o11+o12+o21+o22
        List<String> keywords = new ArrayList<>();
        List<String> collowords = new ArrayList<>();
        Map<String, Integer> keywordFreqMap = new HashMap<>();
        Map<String, Integer> colloFreqMap = new HashMap<>();
        //if the algorithm is not "None", computing o11, o12, o21 and o22
        if(!"None".equals(testAlg) && !"None".equals(bayesAlg) && !"None".equals(effectSizeAlg)){
            Set<String> uniqueKeywords = new HashSet<>();
            Set<String> uniqueCollowords = new HashSet<>();
            for (Object obj : colloArray) {
                JSONObject colloJson = (JSONObject) obj;
                String keyword = colloJson.getString("keyword");
                int freq = colloJson.getIntValue("absoluteFreq");
                uniqueKeywords.add(keyword);
                String colloword = colloJson.getString("collocation");
                uniqueCollowords.add(colloword);
                // update the freq of keyword
                keywordFreqMap.put(keyword, keywordFreqMap.getOrDefault(keyword, 0) + freq);
            }
            // Set to List
            keywords = new ArrayList<>(uniqueKeywords);
            collowords = new ArrayList<>(uniqueCollowords);

            colloFreqMap = blUtils.getTokensTermfreq(corpusName, isCase, collowords);
            int corpusTokenCount = blUtils.getTokenCount(corpusName);

            // compute o11, o12, o21, and o22
            for (Object obj : colloArray) {
                JSONObject colloJson = (JSONObject) obj;
                String keyword = colloJson.getString("keyword");
                int freq = colloJson.getIntValue("absoluteFreq");
                String colloword = colloJson.getString("collocation");
                int o11 = freq;
                int o12 = keywordFreqMap.get(keyword) - o11;
                int o21 = colloFreqMap.get(colloword) - o11;
                int o22 = corpusTokenCount - o12 - o21 - o11;
                colloJson.put("o11", Math.max(o11, 0));
                colloJson.put("o12", Math.max(o12, 0));
                colloJson.put("o21", Math.max(o21, 0));
                colloJson.put("o22", Math.max(o22, 0));
            }
        }

        // add the "key" attribute
        // [Note] before computing the result of algorithm, the "key" should be added.
        for (int i = 0; i < colloArray.size(); i++) {
            JSONObject jsonObject = colloArray.getJSONObject(i);
            jsonObject.put("key", i + 1); // key is 1-based
        }


        // The three algorithm and their results
        // TODO: Maybe this can be optimized at the algorithm level? Instead of calculating the entire Array, each element is calculated independently.
        switch (testAlg) {
            case "Fisher's Exact Test":
                TestAlg.FishersExactTest(colloArray);
                break;
            case "Log-likelihood Ratio Test":
                TestAlg.logLikelihoodRatioTest(colloArray, keywords);
                break;
            case "Pearson's Chi-squared Test":
                TestAlg.pearsonsChiSquaredTest(colloArray, keywords);
                break;
            case "Student's t-test (1-sample)":
                TestAlg.studentsTTest1Sample(colloArray, keywords);
                break;
            case "z-score":
                TestAlg.ZScore(colloArray, keywords);
                break;
            default:
                System.out.println(testAlg);
                break;
        }

        switch (bayesAlg) {
            case "Log-likelihood Ratio Test":
                BayesAlg.bayesLogLikelihoodRatioTest(colloArray, keywords);
                break;
            default:
                System.out.println(testAlg);
                break;
        }

        switch (effectSizeAlg) {
            case "%DIFF":
                EffectSizeAlg.pctDiff(colloArray, keywords);
                break;
            case "Cubic Association Ratio":
                EffectSizeAlg.im3(colloArray, keywords);
                break;
            case "Dice's Coefficient":
                EffectSizeAlg.dicesCoeff(colloArray, keywords);
                break;
            case "Difference Coefficient":
                EffectSizeAlg.diffCoeff(colloArray, keywords);
                break;
            case "Jaccard Index":
                EffectSizeAlg.JaccardIndex(colloArray, keywords);
                break;
            case "Log Ratio":
                EffectSizeAlg.logRatio(colloArray, keywords);
                break;
            case "Log-Frequency Biased MD":
                EffectSizeAlg.lfmd(colloArray, keywords);
                break;
            case "logDice":
                EffectSizeAlg.logDice(colloArray, keywords);
                break;
            case "MI.log-f":
                EffectSizeAlg.miLogF(colloArray, keywords);
                break;
            case "Minimum Sensitivity":
                EffectSizeAlg.minSensitivity(colloArray, keywords);
                break;
            case "Mutual Dependency":
                EffectSizeAlg.md(colloArray, keywords);
                break;
            case "Mutual Expectation":
                EffectSizeAlg.me(colloArray, keywords);
                break;
            case "Mutual Information":
                EffectSizeAlg.mi(colloArray, keywords);
                break;
            case "Odds Ratio":
                EffectSizeAlg.oddsRatio(colloArray, keywords);
                break;
            case "Pointwise Mutual Information":
                EffectSizeAlg.pmi(colloArray, keywords);
                break;
            case "Poisson Collocation Measure":
                EffectSizeAlg.poissonCollocationMeasure(colloArray, keywords);
                break;
            case "Squared Phi Coefficient":
                EffectSizeAlg.squaredPhiCoeff(colloArray, keywords);
                break;
            default:
                System.out.println(testAlg);
                break;
        }

        // Get column name
        JSONArray resultColumnJsonArray = new JSONArray();
        List<String> columnNamesList = new ArrayList<>(Arrays.asList("key", "keyword", "collocation", "absoluteFreq", "relativeFreq", "source"));
        if (!"None".equals(testAlg)) {
            columnNamesList.add("testAlg_p");
            columnNamesList.add("testAlg_stat");
        }
        if (!"None".equals(bayesAlg)) {
            columnNamesList.add("bayesAlg");
        }
        if (!"None".equals(effectSizeAlg)) {
            columnNamesList.add("effectSizeAlg");
        }
        String[] columnNames = columnNamesList.toArray(new String[0]);
        for (String columnName : columnNames) {
            JSONObject obj = new JSONObject();
            obj.put("prop", columnName);
            obj.put("label", columnName);
            resultColumnJsonArray.add(obj);
        }

        // the final JSON should return to frontend
        JSONObject resultJson = new JSONObject();
        resultJson.put("columns", resultColumnJsonArray);
        resultJson.put("data", colloArray);

        return resultJson;
    }
}
