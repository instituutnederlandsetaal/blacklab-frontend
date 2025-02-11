package nl.inl.corpuswebsite.utils.analyseUtils.Alg;

import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import net.sf.saxon.functions.Count;

import java.util.*;

/**
 * ClassName: KeywordAlg
 * Package: nl.inl.corpuswebsite.utils.analyseUtils.Alg
 * Description: the Algorithm of Measure of Keyword implementation.
 *             TF-IDF: https://en.wikipedia.org/wiki/Tf%E2%80%93idf
 *             TextRank: https://web.eecs.umich.edu/~mihalcea/papers/mihalcea.emnlp04.pdf
 */
public class KeywordAlg {
    /**
     * TextRank Algorithmic keyword extraction
     * @param corpus List<List<String>> corpus
     * @param stopwords List<String> stopwords
     * @param keywordNum int The number of keywords to extract
     * @param dampingFactor float Damping factor (general value range 0.85)
     * @param maxIter int Maximum number of iterations (generally 100-200)
     * @param minDiff float Minimum convergence difference（generally 0.0001）
     * @param windowSize int The size of the co-occurrence window（generally 2-5）
     * @return String JSON including keyword and textRank Weight
     */
    public static JSONArray computeTextRank(List<List<String>> corpus, Set<String> stopwords, int keywordNum, float dampingFactor, int maxIter, float minDiff, int windowSize) {
        // Count the word frequency of all documents
        Map<String, Set<String>> wordGraph = new HashMap<>();
        // Build a co-occurrence diagram
        for (List<String> document : corpus) {
            Queue<String> window = new LinkedList<>();
            for (String word : document) {
                // Skip stop word
                if (stopwords.contains(word)) {
                    continue;
                }
                if (!wordGraph.containsKey(word)) {
                    wordGraph.put(word, new HashSet<>());
                }
                // Adds the current word to the window
                window.offer(word);
                if (window.size() > windowSize) {
                    window.poll();
                }
                // Creates edges between words in the window
                for (String w1 : window) {
                    for (String w2 : window) {
                        if (!w1.equals(w2)) {
                            wordGraph.get(w1).add(w2);
                            wordGraph.get(w2).add(w1);
                        }
                    }
                }
            }
        }

        // Initializes the TextRank value for each word
        Map<String, Float> score = new HashMap<>();
        for (String word : wordGraph.keySet()) {
            score.put(word, 1.0f);
        }

        // Calculate the TextRank value iteratively, the loop comes from: http://www.hankcs.com/nlp/textrank-algorithm-to-extract-the-keywords-java-implementation.html
        for (int iter = 0; iter < maxIter; iter++) {
            Map<String, Float> newScore = new HashMap<>();
            float maxDiff = 0;

            for (String word : wordGraph.keySet()) {
                float rank = 1 - dampingFactor;
                for (String neighbor : wordGraph.get(word)) {
                    int size = wordGraph.get(neighbor).size();
                    if (size == 0) {
                        continue;
                    }
                    rank += dampingFactor / size * (score.get(neighbor) == null ? 0 : score.get(neighbor));
                }
                newScore.put(word, rank);
                maxDiff = Math.max(maxDiff, Math.abs(rank - (score.get(word) == null ? 1 : score.get(word))));
            }

            score = newScore;
            if (maxDiff <= minDiff) {
                break;
            }
        }

        // Sort and extract keywords
        List<Map.Entry<String, Float>> entryList = new ArrayList<>(score.entrySet());
        entryList.sort((e1, e2) -> Float.compare(e2.getValue(), e1.getValue()));

        // Generate JSON results
        JSONArray jsonArray = new JSONArray();
        for (int i = 0; i < Math.min(keywordNum, entryList.size()); i++) {
            JSONObject jsonObject = new JSONObject();
            jsonObject.put("word", entryList.get(i).getKey());
            jsonObject.put("weight", entryList.get(i).getValue());
            jsonArray.add(jsonObject);
        }

        return jsonArray;
    }


    /**
     * TF-IDF Algorithmic keyword extraction
     * @param corpus List<List<String>> corpus
     * @param stopWords List<String> stopwords
     * @param keywordNum int The number of keywords to extract
     * @return String JSON including keyword and TF-IDF Weight
     */
    public static JSONArray computeTFIDF(List<List<String>> corpus, Set<String> stopWords, int keywordNum) {
        // Word Frequency (TF) of the whole corpus
        Map<String, Integer> termFrequency = new HashMap<>();
        int totalTerms = 0; // Record the total number of words in the corpus

        for (List<String> document : corpus) {
            for (String word : document) {
                if (!stopWords.contains(word)) {
                    termFrequency.put(word, termFrequency.getOrDefault(word, 0) + 1);
                    totalTerms++;
                }
            }
        }

        // compute IDF
        Map<String, Float> idfMap = computeIDF(corpus, stopWords);

        // compute TF-IDF
        Map<String, Float> tfidfMap = new HashMap<>();
        for (Map.Entry<String, Integer> entry : termFrequency.entrySet()) {
            String word = entry.getKey();
            float tf = (float) entry.getValue() / totalTerms;
            if (idfMap.containsKey(word)) {
                float tfidf = tf * idfMap.get(word);
                tfidfMap.put(word, tfidf);
            }
        }

        // sort and get JSON
        List<Map.Entry<String, Float>> sortedList = new ArrayList<>(tfidfMap.entrySet());
        sortedList.sort((e1, e2) -> e2.getValue().compareTo(e1.getValue()));
        JSONArray jsonArray = new JSONArray();
        for (int i = 0; i < Math.min(keywordNum, sortedList.size()); i++) {
            JSONObject jsonObject = new JSONObject();
            jsonObject.put("word", sortedList.get(i).getKey());
            jsonObject.put("weight", sortedList.get(i).getValue());
            jsonArray.add(jsonObject);
        }

        return jsonArray;
    }

    // compute IDF value
    private static Map<String, Float> computeIDF(List<List<String>> corpus, Set<String> stopWords) {
        Map<String, Integer> documentFrequency = new HashMap<>();
        int totalDocuments = corpus.size();

        for (List<String> document : corpus) {
            Set<String> uniqueTerms = new HashSet<>(document);
            for (String term : uniqueTerms) {
                if (!stopWords.contains(term)) {
                    documentFrequency.put(term, documentFrequency.getOrDefault(term, 0) + 1);
                }
            }
        }

        // compute IDF
        Map<String, Float> idfMap = new HashMap<>();
        for (Map.Entry<String, Integer> entry : documentFrequency.entrySet()) {
            String term = entry.getKey();
            float idf = (float) Math.log((double) totalDocuments / entry.getValue());
            idfMap.put(term, idf);
        }

        return idfMap;
    }
}
