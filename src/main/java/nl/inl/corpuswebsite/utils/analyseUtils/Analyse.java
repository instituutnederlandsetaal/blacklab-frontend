package nl.inl.corpuswebsite.utils.analyseUtils;

import com.alibaba.fastjson.JSONObject;

/**
 * ClassName: Analyse
 * Package: nl.inl.corpuswebsite.utils.analyseUtils
 * Description: After receiving the information from URL from the front end, determine the type of service required based on the URL and then proceed with the distribution.
 */
public class Analyse {
    /** Analyse the information form URL from the front end, determine the type of service required based on the URL and then proceed with the distribution.
     * @param analType the analysed type, including topic, collocation, cooccur, wordlist, keyword, and network.
     * @param params The parameters parsed from the URL, in JSON format.
     * @param serverUrl the backend server url. eg. http://localhost:8084/blacklab-server/
     * @param corpusName the name of corpus. e.g. my-index
     * @return The result that should be returned to the front end, in JSON format.
     */
    public static JSONObject processAnalyse(String analType, JSONObject params, String serverUrl, String corpusName) throws Exception {
        JSONObject result = new JSONObject();
        if ("topic".equals(analType)) {
            int topicNumber = params.getIntValue("topicNumber");
            int wordNumber = params.getIntValue("showNumber");
            Boolean isCase = params.getBooleanValue("isCase");
            String stopwordsStr = params.getString("stopwords");
            int iteration = params.getIntValue("iteration");

            TopicAnalyse topicAnalyse = new TopicAnalyse(serverUrl, topicNumber, wordNumber, isCase, corpusName, stopwordsStr, iteration);
            result = topicAnalyse.getTopicService();
        } else if ("collocation".equals(analType)) {
            int aroundNumber = params.getIntValue("aroundNumber");
            int wordNumber = params.getIntValue("showNumber");
            Boolean isCase = params.getBooleanValue("isCase");
            String stopwordsStr = params.getString("stopwords");
            String keywordsStr = params.getString("keywords");
            String testAlg = params.getString("testAlg");
            String bayesAlg = params.getString("bayesAlg");
            String effectSizeAlg = params.getString("effectSizeAlg");

            CollocationAnalyse collocationAnalyse = new CollocationAnalyse(serverUrl, aroundNumber, wordNumber, isCase, corpusName, stopwordsStr, keywordsStr, testAlg, bayesAlg, effectSizeAlg);
            result = collocationAnalyse.getColloService();
        } else if ("cooccur".equals(analType)) {
            int wordNumber = params.getIntValue("showNumber");
            Boolean isCase = params.getBooleanValue("isCase");
            String stopwordsStr = params.getString("stopwords");
            String keywordsStr = params.getString("keywords");
            String edgeAlg = params.getString("edgeAlg");

            CooccurAnalyse cooccurAnalyse = new CooccurAnalyse(serverUrl, wordNumber, isCase, corpusName, stopwordsStr, keywordsStr, edgeAlg);
            result = cooccurAnalyse.getCooccurService();
        } else if ("wordlist".equals(analType)) {
            int wordNumber = params.getIntValue("showNumber");
            Boolean isCase = params.getBooleanValue("isCase");
            String stopwordsStr = params.getString("stopwords");
            String dispersionAlg = params.getString("dispersionAlg");
            String adjustedAlg = params.getString("adjustedAlg");
            int partN = params.getIntValue("partN");

            WordlistAnalyse wordlistAnalyse = new WordlistAnalyse(serverUrl, stopwordsStr, wordNumber, isCase, dispersionAlg, adjustedAlg, corpusName, partN);
            result = wordlistAnalyse.getWordlist();
        } else if ("keyword".equals(analType)) {
            int wordNumber = params.getIntValue("showNumber");
            Boolean isCase = params.getBooleanValue("isCase");
            String stopwordsStr = params.getString("stopwords");
            String keywordAlg = params.getString("keywordAlg");
            if("TF-IDF".equals(keywordAlg))
            {
                KeywordAnalyse keywordAnalyse = new KeywordAnalyse(serverUrl, stopwordsStr, wordNumber, isCase, keywordAlg, corpusName);
                result = keywordAnalyse.getKeyword();
            }
            else if ("TextRank".equals(keywordAlg))
            {
                float dampingFactor = params.getFloatValue("dampingFactor");
                int maxIter = params.getIntValue("maxIter");
                float minDiff = params.getFloatValue("minDiff");
                int windowSize =  params.getIntValue("windowSize");
                KeywordAnalyse keywordAnalyse = new KeywordAnalyse(serverUrl, stopwordsStr, wordNumber, isCase, keywordAlg, corpusName, dampingFactor, maxIter, minDiff, windowSize);
                result = keywordAnalyse.getKeyword();
            }
        }else if ("network".equals(analType)) {
            int wordNumber = params.getIntValue("showNumber");
            String scope = params.getString("scope");
            Boolean isCase = params.getBooleanValue("isCase");
            String stopwordsStr = params.getString("stopwords");
            String edgeAlg = params.getString("edgeAlg");
            float weightThreshold = params.getFloatValue("weightThreshold");
            int numCommunities = params.getIntValue("numCommunities");
            NetworkAnalyse networkAnalyse = new NetworkAnalyse(serverUrl, wordNumber, isCase, corpusName, stopwordsStr, scope, edgeAlg, weightThreshold, numCommunities);
            result = networkAnalyse.getCooccurNetwork();
        }

        return result;
    }
}
