package nl.inl.corpuswebsite.utils.analyseUtils;

import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

import java.util.Arrays;
import java.util.List;
import java.util.Set;

/**
 * ClassName: CooccurAnalyse
 * Package: nl.inl.corpuswebsite.utils.analyseUtils
 * Description: The implementation related to the Cooccur feature.
 */
public class CooccurAnalyse {
    private String baseUrl; // base url connecting to blacklab-server, eg. http://localhost:8084/blacklab-server/
    private int wordNumber; // Number of Words to Show
    private Boolean isCase; // Morphological Variation
    private String corpusName; // the name of corpus
    private String stopwordsStr; // Stopwords using | as the separator, eg. "abandon|bank|car"
    private String keywordsInput; // Keyword string that input by user, eg.[word="apple|banana"&lemma="(?-i)apple|banana"&pos="NN"]
    private String edgeAlg; // the edge's Algorithm

    public CooccurAnalyse(String baseUrl, int wordNumber, Boolean isCase, String corpusName, String stopwordsStr, String keywordsInput, String edgeAlg) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        this.wordNumber = wordNumber;
        this.isCase = isCase;
        this.corpusName = corpusName;
        this.stopwordsStr = stopwordsStr;
        this.keywordsInput = (keywordsInput != null) ? keywordsInput : "";
        this.edgeAlg = edgeAlg;
    }

    public JSONObject getCooccurService() throws Exception {
        BlacklabUtilsForAnalyse blUtils = new BlacklabUtilsForAnalyse(baseUrl);
        Set<String> stopWords = blUtils.getStopwords(stopwordsStr);
        JSONArray resultJsonArray = blUtils.getCooccur(corpusName, isCase, stopWords, wordNumber, keywordsInput, edgeAlg);

        // add the "key" attribute
        for (int i = 0; i < resultJsonArray.size(); i++) {
            JSONObject jsonObject = resultJsonArray.getJSONObject(i);
            jsonObject.put("key", i + 1); // key is 1-based
        }

        // Get column name
        JSONArray resultColumnJsonArray = new JSONArray();
        String[] columnNames = {"key", "keyword", "cooccurWord", "edgeWeight", "absoluteFreq", "relativeFreq"};
        for (String columnName : columnNames) {
            JSONObject obj = new JSONObject();
            obj.put("prop", columnName);
            obj.put("label", columnName);
            resultColumnJsonArray.add(obj);
        }

        // the final JSON that will return to the frontend
        JSONObject resultJson = new JSONObject();
        resultJson.put("columns", resultColumnJsonArray);
        resultJson.put("data", resultJsonArray);

        return resultJson;
    }

}
