package nl.inl.corpuswebsite.utils.analyseUtils;

import cc.mallet.pipe.*;
import cc.mallet.topics.ParallelTopicModel;
import cc.mallet.types.*;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

import java.util.*;

/**
 * ClassName: TopicAnalyse
 * Package: nl.inl.corpuswebsite.utils.analyseUtils
 * Description: The implementation related to the Topic feature. Here, the Mallet package(https://mimno.github.io/Mallet/index) is used for LDA calculations, and the principle can be found in this paper(https://www.cs.columbia.edu/~blei/papers/Blei2012.pdf.
 */
public class TopicAnalyse {
    private String baseUrl; // base url connecting to blacklab-server, eg. http://localhost:8084/blacklab-server/
    private int topicNumber; // the number of topic
    private int wordNumber; // Number of Words to Show
    private Boolean isCase; // Morphological Variation
    private String corpusName; // the name of corpus
    private String stopwordsStr; // Stopwords using | as the separator, eg. "abandon|bank|car"
    private int interation; // Number of Iterations

    public TopicAnalyse(String baseUrl, int topicNumber, int wordNumber, Boolean isCase, String corpusName, String stopwordsStr, int interation)
    {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        this.topicNumber = topicNumber;
        this.wordNumber = wordNumber;
        this.isCase = isCase;
        this.corpusName = corpusName;
        this.stopwordsStr = stopwordsStr;
        this.interation = interation;
    }

    /** get the topic analyse result. **/
    public JSONObject getTopicService() throws Exception {
        String[] stopWordsArray = stopwordsStr.split("\\|"); // Split the stop word string using | as the separator
        List<String> stopWords = Arrays.asList(stopWordsArray);
        BlacklabUtilsForAnalyse blUtils = new BlacklabUtilsForAnalyse(baseUrl);
        List<List<String>> corpus = blUtils.getAllContent(corpusName, stopWords, isCase);

        // Step 1: Create a text processing pipeline
        ArrayList<Pipe> pipeList = new ArrayList<>();
        // Converts text to Token sequence
        pipeList.add(new CharSequence2TokenSequence());
        // Remove stop words (including custom stop words)
        TokenSequenceRemoveStopwords removeStopwords = new TokenSequenceRemoveStopwords(false, false);
        removeStopwords.addStopWords(stopWords.toArray(new String[0]));
        pipeList.add(removeStopwords);
        // Convert Token sequence to feature sequence
        pipeList.add(new TokenSequence2FeatureSequence());
        // Creates an InstanceList to store processed documents
        InstanceList instances = new InstanceList(new SerialPipes(pipeList));

        // Step 2: Add the corpus to the InstanceList
        for (List<String> document : corpus) {
            StringBuilder docContent = new StringBuilder();
            for (String word : document) {
                docContent.append(word).append(" ");
            }
            instances.addThruPipe(new Instance(docContent.toString(), null, "doc_" + instances.size(), null));
        }

        // Step 3: Training LDA model
        int numTopics = topicNumber;
        ParallelTopicModel model = new ParallelTopicModel(numTopics);
        // Set a fixed random seed to ensure the initialization is the same every time you train
        model.setRandomSeed(114514);
        model.addInstances(instances);
        model.setNumThreads(2);  // Set thread count
        model.setNumIterations(interation);  // Set number of iterations
        model.estimate();  // estimate model

        // Step 4: Get the first few words of each topic and their weights in JSON format
        JSONArray resultDataJsonArray = getTopicsJson(model, instances.getDataAlphabet(), wordNumber);

        // Get column name
        JSONArray resultColumnJsonArray = new JSONArray();
        String[] columnNames = {"key", "topic", "topicWeight", "word", "wordWeight"};
        for (String columnName : columnNames) {
            JSONObject obj = new JSONObject();
            obj.put("prop", columnName);
            obj.put("label", columnName);
            resultColumnJsonArray.add(obj);
        }

        // the final JSON that will return to the frontend
        JSONObject resultJson = new JSONObject();
        resultJson.put("columns", resultColumnJsonArray);
        resultJson.put("data", resultDataJsonArray);

        return resultJson;
    }


     /** Output the first few words of each topic and their weights, and return them in JSON format **/
    public static JSONArray getTopicsJson(ParallelTopicModel model, Alphabet dataAlphabet, int topN) {
        ArrayList<TreeSet<IDSorter>> topicSortedWords = model.getSortedWords();
        JSONArray topicsJson = new JSONArray();

        for (int topic = 0; topic < model.getNumTopics(); topic++) {
            double topicWeight = model.getTopicProbabilities(0)[topic];

            // Get the topN words of the current topic and their weights
            JSONArray wordsJson = new JSONArray();
            Iterator<IDSorter> iterator = topicSortedWords.get(topic).iterator();
            while (iterator.hasNext() && wordsJson.size() < topN) {
                IDSorter idCountPair = iterator.next();
                String word = (String) dataAlphabet.lookupObject(idCountPair.getID());
                double weight = idCountPair.getWeight();
                JSONObject wordJson = new JSONObject();
                wordJson.put("topic", "topic_" + String.valueOf(topic + 1));
                wordJson.put("topicWeight",String.format("%.6f", topicWeight));
                wordJson.put("word", word);
                wordJson.put("wordWeight", weight);
                wordsJson.add(wordJson);
            }

            topicsJson.addAll(wordsJson);
        }

        Collections.sort(topicsJson, new Comparator<Object>() {
            @Override
            public int compare(Object o1, Object o2) {
                JSONObject json1 = (JSONObject) o1;
                JSONObject json2 = (JSONObject) o2;
                double weight1 = Float.parseFloat(json1.getString("topicWeight"));
                double weight2 = Float.parseFloat(json2.getString("topicWeight"));
                // descending sort
                return Double.compare(weight2, weight1);
            }
        });

        // add the "key"
        for (int i = 0; i < topicsJson.size(); i++) {
            JSONObject jsonObject = topicsJson.getJSONObject(i);
            jsonObject.put("key", i + 1); // key is 1-based
        }

        return topicsJson;
    }
}
