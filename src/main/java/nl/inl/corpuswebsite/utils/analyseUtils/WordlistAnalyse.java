package nl.inl.corpuswebsite.utils.analyseUtils;

import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

import java.util.*;

import static nl.inl.corpuswebsite.utils.analyseUtils.Alg.DispersionAlg.*;
import static nl.inl.corpuswebsite.utils.analyseUtils.Alg.AdjustedFreqAlg.*;

/**
 * ClassName: WordlistAnalyse
 * Package: nl.inl.corpuswebsite.utils.analyseUtils
 * Description: The implementation related to the Wordlist feature. Here, the algorithm used comes from "wordless", see: https://github.com/BLKSerene/Wordless/blob/main/doc/doc.md#doc-12-4-3
 */
public class WordlistAnalyse {
    private String baseUrl; // base url connecting to blacklab-server, eg. http://localhost:8084/blacklab-server/
    private int wordNumber; // Number of Words to Show
    private Boolean isCase; // Morphological Variation
    private String corpusName; // the name of corpus
    private String stopwordsStr; // Stopwords using | as the separator, eg. "abandon|bank|car"
    private String adjustedAlg; // Measure of Adjusted Frequency
    private String dispersionAlg; // Measure of Dispersion
    private int partN; // The number of parts of the corpus that are divided, which used in Measure of Adjusted Frequency and Measure of Dispersion (only in some algorithm that use "calculateKeywordFrequencies" function)

    public WordlistAnalyse(String baseUrl, String stopwordsStr, int wordNumber, Boolean isCase, String dispersionAlg, String adjustedAlg, String corpusName, int partN) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        this.wordNumber = wordNumber;
        this.isCase = isCase;
        this.corpusName = corpusName;
        this.stopwordsStr = stopwordsStr;
        this.adjustedAlg = adjustedAlg;
        this.dispersionAlg = dispersionAlg;
        this.partN = partN;
    }

    public JSONObject getWordlist() throws Exception {
        BlacklabUtilsForAnalyse blUtils = new BlacklabUtilsForAnalyse(baseUrl);
        Set<String> stopWords = blUtils.getStopwords(stopwordsStr);
        JSONArray wordFreqArray = blUtils.getTermfreq(corpusName, isCase, wordNumber,  stopWords);

        List<String> corpus = blUtils.getAllContentLinear(corpusName, stopWords, isCase);

        switch (dispersionAlg) {
            case "Carroll's D₂":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    double[] freqs = calculateKeywordFrequencies(corpus, keyword, partN);
                    double dispersion = carrollsD2(freqs);
                    keyWordObj.put("dispersion", String.format("%.6f", dispersion)); 
                }
                break;
            case "Gries's DP":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    double[] freqs = calculateKeywordFrequencies(corpus, keyword, partN);
                    double dispersion = griessDP(freqs);
                    keyWordObj.put("dispersion", String.format("%.6f", dispersion)); 
                }
                break;
            case "Gries's DP (Normalization)":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    double[] freqs = calculateKeywordFrequencies(corpus, keyword, partN);
                    double dispersion = griessDPNormalization(freqs);
                    keyWordObj.put("dispersion", String.format("%.6f", dispersion)); 
                }
                break;
            case "Juilland's D":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    double[] freqs = calculateKeywordFrequencies(corpus, keyword, partN);
                    double dispersion = juillandsD(freqs);
                    keyWordObj.put("dispersion", String.format("%.6f", dispersion)); 
                }
                break;
            case "Lyne's D₃":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    double[] freqs = calculateKeywordFrequencies(corpus, keyword, partN);
                    double dispersion = lynesD3(freqs);
                    keyWordObj.put("dispersion", String.format("%.6f", dispersion)); 
                }
                break;
            case "Rosengren's S":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    double[] freqs = calculateKeywordFrequencies(corpus, keyword, partN);
                    double dispersion = rosengrensS(freqs);
                    keyWordObj.put("dispersion", String.format("%.6f", dispersion)); 
                }
                break;
            case "Zhang's Distributional Consistency":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    double[] freqs = calculateKeywordFrequencies(corpus, keyword, partN);
                    double dispersion = zhangsDistributionalConsistency(freqs);
                    keyWordObj.put("dispersion", String.format("%.6f", dispersion)); 
                }
                break;
            case "Average Logarithmic Distance":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    List<Integer> dists = getDists(corpus, keyword);
                    double dispersion = averageLogarithmicDistance(dists, corpus.size());
                    keyWordObj.put("dispersion", String.format("%.6f", dispersion)); 
                }
                break;
            case "Average Reduced Frequency":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    List<Integer> dists = getDists(corpus, keyword);
                    double dispersion = averageReducedFrequency(dists, corpus.size());
                    keyWordObj.put("dispersion", String.format("%.6f", dispersion)); 
                }
                break;
            case "Average Waiting Time":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    List<Integer> dists = getDists(corpus, keyword);
                    double dispersion = averageWaitingTime(dists, corpus.size());
                    keyWordObj.put("dispersion", String.format("%.6f", dispersion)); 
                }
                break;
            default:
                System.out.println(dispersionAlg);
                break;
        }

        switch (adjustedAlg) {
            case "Carroll's Uₘ":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    double[] freqs = calculateKeywordFrequencies(corpus, keyword, partN);
                    double adjusted = carrollsUm(freqs);
                    keyWordObj.put("adjusted", String.format("%.6f", adjusted)); 
                }
                break;
            case "Engwall's FM":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    double[] freqs = calculateKeywordFrequencies(corpus, keyword, partN);
                    double adjusted = engwallsFm(freqs);
                    keyWordObj.put("adjusted", String.format("%.6f", adjusted)); 
                }
                break;
            case "Juilland's U":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    double[] freqs = calculateKeywordFrequencies(corpus, keyword, partN);
                    double adjusted = juillandsU(freqs);
                    keyWordObj.put("adjusted", String.format("%.6f", adjusted)); 
                }
                break;
            case "Kromer's UR":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    double[] freqs = calculateKeywordFrequencies(corpus, keyword, partN);
                    double adjusted = kromersUr(freqs);
                    keyWordObj.put("adjusted", String.format("%.6f", adjusted)); 
                }
                break;
            case "Rosengren's KF":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    double[] freqs = calculateKeywordFrequencies(corpus, keyword, partN);
                    double adjusted = rosengrensKf(freqs);
                    keyWordObj.put("adjusted", String.format("%.6f", adjusted)); 
                }
                break;
            case "Average Logarithmic Distance":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    List<Integer> dists = getDists(corpus, keyword);
                    double adjusted = fald(dists, corpus.size());
                    keyWordObj.put("adjusted", String.format("%.6f", adjusted)); 
                }
                break;
            case "Average Reduced Frequency":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    List<Integer> dists = getDists(corpus, keyword);
                    double adjusted = farf(dists, corpus.size());
                    keyWordObj.put("adjusted", String.format("%.6f", adjusted)); 
                }
                break;
            case "Average Waiting Time":
                for (int i = 0; i < wordFreqArray.size(); i++) {
                    JSONObject keyWordObj = wordFreqArray.getJSONObject(i);
                    String keyword = keyWordObj.getString("word");
                    List<Integer> dists = getDists(corpus, keyword);
                    double adjusted = fawt(dists, corpus.size());
                    keyWordObj.put("adjusted", String.format("%.6f", adjusted)); 
                }
                break;
            default:
                System.out.println(adjustedAlg);
                break;
        }

        // add the "key" attribute
        for (int i = 0; i < wordFreqArray.size(); i++) {
            JSONObject jsonObject = wordFreqArray.getJSONObject(i);
            jsonObject.put("key", i + 1); // key is based-1
        }

        JSONArray resultColumnJsonArray = new JSONArray();
        List<String> columnNamesList = new ArrayList<>(Arrays.asList("key", "word", "absoluteFreq", "relativeFreq", "source"));
        if (!"None".equals(dispersionAlg)) {
            columnNamesList.add("dispersion");
        }
        if (!"None".equals(adjustedAlg)) {
            columnNamesList.add("adjusted");
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
        resultJson.put("data", wordFreqArray);
        return resultJson;
    }

    // Calculate keyword frequencies, used by DispersionAlg and adjustedFreqAlg
    public double[] calculateKeywordFrequencies(List<String> corpus, String keyword, int partN) {
        int corpusSize = corpus.size();
        int chunkSize = corpusSize / partN; // The basic size of each section
        int remainder = corpusSize % partN; // The number of elements left after allocation
        double[] freqs = new double[partN];

        List<String> currentPart = new ArrayList<>();
        int currentPartIndex = 0;

        int effectiveChunkSize = chunkSize + (currentPartIndex < remainder ? 1 : 0);

        for (int i = 0; i < corpusSize; i++) {
            currentPart.add(corpus.get(i));

            // Check if the size of the current section has been reached (or the last section may contain additional elements)
            if ((i + 1) % effectiveChunkSize == 0 || (i + 1) == corpusSize) {
                // Counts the number of keyword occurrences in the current section
                int keywordCount = (int) currentPart.stream().filter(s -> s.contains(keyword)).count();
                freqs[currentPartIndex] = keywordCount;

                // Reset the current section to prepare the next section (if any)
                currentPart = new ArrayList<>();
                currentPartIndex++;
            }
        }

        return freqs;
    }

    // Calculate distance, used by DispersionAlg and adjustedFreqAlg
    public List<Integer> getDists(List<String> tokens, String searchTerm) {
        List<Integer> positions = new ArrayList<>();

        // Find the location of the search term
        for (int i = 0; i < tokens.size(); i++) {
            if (tokens.get(i).equals(searchTerm)) {
                positions.add(i);
            }
        }

        List<Integer> dists = new ArrayList<>();

        // If the search term appears at least once
        if (!positions.isEmpty()) {
            // 计算相邻出现之间的距离
            for (int i = 1; i < positions.size(); i++) {
                dists.add(positions.get(i) - positions.get(i - 1));
            }

            // Add the "loop distance" between the first and last occurrence
            if (positions.size() > 1) {
                int circularDistance = (tokens.size() - positions.get(positions.size() - 1)) + positions.get(0);
                dists.add(0, circularDistance); // Insert at the beginning of the list
            }
        }

        return dists;
    }
}
