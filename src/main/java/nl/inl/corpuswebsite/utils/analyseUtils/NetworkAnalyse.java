package nl.inl.corpuswebsite.utils.analyseUtils;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import org.jgrapht.Graph;
import org.jgrapht.alg.clustering.GirvanNewmanClustering;
import org.jgrapht.alg.interfaces.ClusteringAlgorithm;
import org.jgrapht.graph.DefaultWeightedEdge;
import org.jgrapht.graph.SimpleWeightedGraph;

import java.text.DecimalFormat;
import java.util.*;

public class NetworkAnalyse {
    private String baseUrl; // base url connecting to blacklab-server, eg. http://localhost:8084/blacklab-server/
    private int wordNumber; // Number of Words to Show
    private Boolean isCase; // Morphological Variation
    private String corpusName; // the name of corpus
    private String stopwordsStr; // Stopwords using | as the separator, eg. "abandon|bank|car"
    private String scope; // the scope that will be used as "within", such as: sentence - within <s/>
    private String edgeAlg; // the edge's Algorithm
    private float weightThreshold; // the threshold of edge weight, if the weight is greater than the threshold, it is reserved
    private int numCommunities; // Number of Community

    public NetworkAnalyse(String baseUrl, int wordNumber, Boolean isCase, String corpusName, String stopwordsStr, String scope, String edgeAlg, float weightThreshold, int numCommunities) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        this.wordNumber = wordNumber;
        this.isCase = isCase;
        this.corpusName = corpusName;
        this.stopwordsStr = stopwordsStr;
        this.scope = scope;
        this.edgeAlg = edgeAlg;
        this.weightThreshold = weightThreshold;
        this.numCommunities = numCommunities;
    }

    public JSONObject getCooccurNetwork() throws Exception {
        String[] stopWordsArray = stopwordsStr.split("\\|");
        List<String> stopWords = Arrays.asList(stopWordsArray);

        BlacklabUtilsForAnalyse blUtils = new BlacklabUtilsForAnalyse(baseUrl);
        JSONArray wordFreqArray = blUtils.getTermfreq(corpusName, isCase, wordNumber,  stopWords);

        // Store each keyword and its word frequency
        JSONArray pointsArray = new JSONArray();
        // key is keyword and value is absoluteFreq + "|" + relativeFreq
        Map<String, String> keywordFreqMap = new HashMap<>();
        List<String> keywords = new ArrayList<>();
        int count = 0;
        for (Object obj : wordFreqArray) {
            JSONObject wordJson = (JSONObject) obj;
            String word = wordJson.getString("word");
            if (!stopWords.contains(word)) {
                int absoluteFreq = wordJson.getIntValue("absoluteFreq");
                String relativeFreq = wordJson.getString("relativeFreq");
                JSONObject pointObj = new JSONObject();
                pointObj.put("word", word);
                pointObj.put("absoluteFreq", absoluteFreq);
                pointObj.put("relativeFreq", relativeFreq);
                pointsArray.add(pointObj);
                keywords.add(word);
                keywordFreqMap.put(word, absoluteFreq + "|" + relativeFreq);
                count++;
            }
            // If a sufficient number of word frequencies have been obtained, the traversal stops
            if (count > wordNumber) {
                break;
            }
        }

        JSONArray edgeArray = blUtils.getCooccurNetworkEdge(corpusName, isCase, stopWords, keywords, edgeAlg, scope, weightThreshold);

        JSONArray filteredEdgeArray = new JSONArray();
        for (int i = 0; i < edgeArray.size(); i++) {
            JSONObject jsonObject = edgeArray.getJSONObject(i);
            String[] parts = new String[]{"",""};
            String keyword = jsonObject.getString("keyword");
            String cooccurWord = jsonObject.getString("cooccurWord");
            if(keywords.contains(keyword) && keywords.contains(cooccurWord) && !keyword.equals(cooccurWord))
            {
                JSONObject edgeObj = new JSONObject();
                if(keywordFreqMap.get(keyword) != null){
                    parts = keywordFreqMap.get(keyword).split("\\|");
                    int absoluteFreq1 = Integer.parseInt(parts[0]);
                    int absoluteFreq2 = jsonObject.getIntValue("absoluteFreq");
                    if(absoluteFreq1 >= absoluteFreq2){
                        edgeObj.put("absoluteFreq2", absoluteFreq2);
                        edgeObj.put("relativeFreq2", jsonObject.getString("relativeFreq"));
                        edgeObj.put("absoluteFreq1", absoluteFreq1);
                        edgeObj.put("relativeFreq1", parts.length > 1 ? parts[1] : "");
                        edgeObj.put("word2", cooccurWord);
                        edgeObj.put("word1", keyword);
                        edgeObj.put("edgeWeight", jsonObject.getString("edgeWeight"));
                        filteredEdgeArray.add(edgeObj);
                    }
                }

            }
        }

        // In descending order of edgeWeight
        Collections.sort(filteredEdgeArray, new Comparator<Object>() {
            @Override
            public int compare(Object o1, Object o2) {
                JSONObject json1 = (JSONObject) o1;
                JSONObject json2 = (JSONObject) o2;
                double weight1 = Float.parseFloat(json1.getString("edgeWeight").replace("%", ""));
                double weight2 = Float.parseFloat(json2.getString("edgeWeight").replace("%", ""));
                return Double.compare(weight2, weight1);
            }
        });
        // community detection
        Graph<String, DefaultWeightedEdge> graph = new SimpleWeightedGraph<>(DefaultWeightedEdge.class);

        Set<String> pointWords = new HashSet<>();
        // add point
        for (Object pointObj : pointsArray) {
            String word = JSON.parseObject(pointObj.toString()).getString("word");
            graph.addVertex(word);
            pointWords.add(word);
        }

        // add edge
        for (Object edgeObj : filteredEdgeArray) {
            JSONObject edge = JSON.parseObject(edgeObj.toString());
            String word1 = edge.getString("word1");
            String word2 = edge.getString("word2");
            String edgeWeightStr = edge.getString("edgeWeight");
            double edgeWeight = Float.parseFloat(edgeWeightStr.replace("%", "")) / 100;
            // Check that both endpoints are in pointsArray
            if (pointWords.contains(word1) && pointWords.contains(word2)) {
                DefaultWeightedEdge edgeToAdd = graph.addEdge(word1, word2);
                if (edgeToAdd != null) {
                    graph.setEdgeWeight(edgeToAdd, edgeWeight);
                }
            }
        }
        // Remove isolated spots
        for (String vertex : new java.util.ArrayList<>(graph.vertexSet())) {
            if (graph.degreeOf(vertex) == 0) {
                graph.removeVertex(vertex);
            }
        }
        // Create a new JSONArray to store the update information for the non-isolated node
        JSONArray filteredPointsArray = new JSONArray();
        if (!graph.vertexSet().isEmpty()) {
            numCommunities = Math.max(1, Math.min(numCommunities, graph.vertexSet().size()));
            GirvanNewmanClustering<String, DefaultWeightedEdge> clustering =
                    new GirvanNewmanClustering<>(graph, numCommunities);
            ClusteringAlgorithm.Clustering<String> communities = clustering.getClustering();

            Map<String, Integer> communityMap = new HashMap<>();
            int communityId = 1;
            for (Set<String> community : communities) {
                for (String vertex : community) {
                    communityMap.put(vertex, communityId);
                }
                communityId++;
            }

            DecimalFormat df = new DecimalFormat("0.000000");
            // Iterate over the pointsArray, calculating the properties of each non-isolated node
            for (Object pointObj : pointsArray) {
                JSONObject point = (JSONObject) pointObj;
                String word = point.getString("word");

                if (graph.containsVertex(word) && graph.degreeOf(word) > 0) {
                    int degree = graph.degreeOf(word);
                    double edgeWeightSum = 0.0;

                    for (DefaultWeightedEdge edge : graph.edgesOf(word)) {
                        edgeWeightSum += graph.getEdgeWeight(edge);
                    }
                    Integer community = communityMap.get(word);
                    point.put("degree", degree);
                    point.put("edgeWeightSum", df.format(edgeWeightSum * 100) + "%");
                    point.put("community", community);
                    filteredPointsArray.add(point);
                }
            }
        }

        // add the "key" attribute
        for (int i = 0; i < filteredEdgeArray.size(); i++) {
            JSONObject jsonObject = filteredEdgeArray.getJSONObject(i);
            jsonObject.put("key", i + 1); // key is 1-based
        }

        // Get column name
        JSONArray resultColumnJsonArray = new JSONArray();
        String[] columnNames = {"key", "word1", "word2", "edgeWeight", "absoluteFreq1", "absoluteFreq2", "relativeFreq1", "relativeFreq2"};
        for (String columnName : columnNames) {
            JSONObject obj = new JSONObject();
            obj.put("prop", columnName);
            obj.put("label", columnName);
            resultColumnJsonArray.add(obj);
        }

        // the final JSON that return to frontend
        JSONObject resultJson = new JSONObject();
        resultJson.put("columns", resultColumnJsonArray);
        resultJson.put("data", filteredEdgeArray);
        resultJson.put("points", filteredPointsArray);

        return resultJson;
    }
}
