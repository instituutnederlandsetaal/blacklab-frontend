package nl.inl.corpuswebsite.utils.analyseUtils;

import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import static nl.inl.corpuswebsite.utils.analyseUtils.Alg.KeywordAlg.*;

/**
 * ClassName: KeywordAnalyse
 * Package: nl.inl.corpuswebsite.utils.analyseUtils
 * Description: The implementation related to the Keyword feature.
 */
public class KeywordAnalyse {
    private String baseUrl; // base url connecting to blacklab-server, eg. http://localhost:8084/blacklab-server/
    private int wordNumber; // Number of Words to Show
    private Boolean isCase; // Morphological Variation
    private String corpusName; // the name of corpus
    private String stopwordsStr; // Stopwords using | as the separator, eg. "abandon|bank|car"
    private String keywordAlg; // the keyword's Algorithm
    private float dampingFactor; // Damping Factor, used in textRank
    private int maxIter; // Maximum Number of Iterations, used in textRank
    private float minDiff; // Minimum Convergence Difference, used in textRank
    private int windowSize; // Co-occurrence Window Size, used in textRank

    public KeywordAnalyse(String baseUrl, String stopwordsStr, int wordNumber, Boolean isCase, String keywordAlg, String corpusName)
    {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        this.wordNumber = wordNumber;
        this.isCase = isCase;
        this.corpusName = corpusName;
        this.stopwordsStr = stopwordsStr;
        this.keywordAlg = keywordAlg;
        this.dampingFactor = 0;
        this.maxIter = 0;
        this.minDiff = 0;
        this.windowSize = 0;
    }

    public KeywordAnalyse(String baseUrl, String stopwordsStr, int wordNumber, Boolean isCase, String keywordAlg, String corpusName, float dampingFactor, int maxIter, float minDiff, int windowSize)
    {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        this.wordNumber = wordNumber;
        this.isCase = isCase;
        this.corpusName = corpusName;
        this.stopwordsStr = stopwordsStr;
        this.keywordAlg = keywordAlg;
        this.dampingFactor = dampingFactor;
        this.maxIter = maxIter;
        this.minDiff = minDiff;
        this.windowSize = windowSize;
    }

    public JSONObject getKeyword() throws Exception {
        BlacklabUtilsForAnalyse blUtils = new BlacklabUtilsForAnalyse(baseUrl);
        Set<String> stopWords = blUtils.getStopwords(stopwordsStr);
        List<List<String>> corpusList = blUtils.getAllContent(corpusName, stopWords, isCase);
        JSONArray resultArray = new JSONArray();
        if (Objects.equals(keywordAlg, "TF-IDF")) {
            resultArray = computeTFIDF(corpusList, stopWords, wordNumber);
        } else if(Objects.equals(keywordAlg, "TextRank"))
        {
            resultArray = computeTextRank(corpusList, stopWords, wordNumber, dampingFactor, maxIter, minDiff, windowSize);
        }

        // add the key
        for (int i = 0; i < resultArray.size(); i++) {
            JSONObject jsonObject = resultArray.getJSONObject(i);
            jsonObject.put("key", i + 1); // key is 1-based
        }

        JSONArray resultColumnJsonArray = new JSONArray();
        String[] columnNames = {"key", "word", "weight"};
        for (String columnName : columnNames) {
            JSONObject obj = new JSONObject();
            obj.put("prop", columnName);
            obj.put("label", columnName);
            resultColumnJsonArray.add(obj);
        }

        // the final JSON that will return to the frontend
        JSONObject resultJson = new JSONObject();
        resultJson.put("columns", resultColumnJsonArray);
        resultJson.put("data", resultArray);

        return resultJson;
    }
}
