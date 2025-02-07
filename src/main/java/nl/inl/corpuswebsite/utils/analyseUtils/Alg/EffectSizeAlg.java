package nl.inl.corpuswebsite.utils.analyseUtils.Alg;

import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static nl.inl.corpuswebsite.utils.analyseUtils.Alg.AlgUtils.*;

/**
 * ClassName: EffectSizeAlg
 * Package: nl.inl.corpuswebsite.utils.analyseUtils.Alg
 * Description: the Effect Size Algorithm implementation. The algorithm here see "wordless": https://github.com/BLKSerene/Wordless/blob/main/doc/doc.md#doc-12-4-4
 */
public class EffectSizeAlg {
    public static void pctDiff(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject);

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            int[][] marginalFreqs = getFreqsMarginal(o11s, o12s, o21s, o22s);

            int[] ox1s = marginalFreqs[2];
            int[] ox2s = marginalFreqs[3];

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int o11 = o11s[i];
                int o12 = o12s[i];
                if (o11 == 0 && o12 > 0) {
                    ans[i] =  Double.NEGATIVE_INFINITY;
                } else if (o11 > 0 && o12 == 0) {
                    ans[i] =  Double.POSITIVE_INFINITY;
                } else {
                    int ox1 = ox1s[i];
                    int ox2 = ox2s[i];
                    double numerator = safeDivide(o11, ox1) - safeDivide(o12, ox2);
                    double denominator = safeDivide(o12, ox2);
                    ans[i] =  safeDivide((numerator * 100) , denominator);
                }
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };

    public static void im3(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject); 

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            double[][] exceptedFreqs = getFreqsExpected(o11s, o12s, o21s, o22s);

            double[] e11s = exceptedFreqs[0];

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int o11 = o11s[i];
                double e11 = e11s[i];
                ans[i] = safeLog2(safeDivide(Math.pow(o11, 3), e11));
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };

    public static void dicesCoeff(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject);

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            int[][] marginalFreqs = getFreqsMarginal(o11s, o12s, o21s, o22s);

            int[] o1xs = marginalFreqs[0];
            int[] ox1s = marginalFreqs[2];

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int o1x = o1xs[i];
                int ox1 = ox1s[i];
                int o11 = o11s[i];
                ans[i] = safeDivide(2 * o11, o1x + ox1);
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };

    public static void diffCoeff(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject);
            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            int[][] marginalFreqs = getFreqsMarginal(o11s, o12s, o21s, o22s);

            int[] ox1s = marginalFreqs[2];
            int[] ox2s = marginalFreqs[3];

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int ox1 = ox1s[i];
                int ox2 = ox2s[i];
                if (ox1 > 0 && ox2 > 0) {
                    int o11 = o11s[i];
                    int o12 = o12s[i];
                    ans[i] =  safeDivide(safeDivide(o11, ox1) - safeDivide(o12, ox2), safeDivide(o11, ox1) + safeDivide(o12, ox2));
                } else {
                    ans[i] = 0;
                }
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };

    public static void JaccardIndex(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject);

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int o11 = o11s[i];
                int o12 = o12s[i];
                int o21 = o21s[i];
                ans[i] = safeDivide(o11, o11 + o12 + o21);
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };

    public static void logRatio(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject); 

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            int[][] marginalFreqs = getFreqsMarginal(o11s, o12s, o21s, o22s);

            int[] ox1s = marginalFreqs[2];
            int[] ox2s = marginalFreqs[3];

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int o11 = o11s[i];
                int o12 = o12s[i];
                if (o11 == 0 && o12 > 0) {
                    ans[i] =  Double.NEGATIVE_INFINITY;
                } else if (o11 > 0 && o12 == 0) {
                    ans[i] =  Double.POSITIVE_INFINITY;
                } else {
                    int ox1 = ox1s[i];
                    int ox2 = ox2s[i];
                    ans[i] = safeLog2(safeDivide(safeDivide(o11, ox1), safeDivide(o12, ox2)));
                }
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };

    public static void lfmd(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject); 

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            double[][] exceptedFreqs = getFreqsExpected(o11s, o12s, o21s, o22s);

            double[] e11s = exceptedFreqs[0];

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int o11 = o11s[i];
                double e11 = e11s[i];
                ans[i] = safeLog2(safeDivide(Math.pow(o11, 2), e11)) + safeLog2(o11);
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };

    public static void logDice(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        // 遍历JSON数组
        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject); 

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            int[][] marginalFreqs = getFreqsMarginal(o11s, o12s, o21s, o22s);

            int[] o1xs = marginalFreqs[0];
            int[] ox1s = marginalFreqs[2];

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int o1x = o1xs[i];
                int ox1 = ox1s[i];
                int o11 = o11s[i];
                if( ox1 + o1x == 0)                {
                    ans[i] = 14;
                } else {
                    ans[i] = safeDivide(2 * o11, o1x + ox1);
                }
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };

    public static void miLogF(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        // 遍历JSON数组
        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject); 

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            double[][] exceptedFreqs = getFreqsExpected(o11s, o12s, o21s, o22s);

            double[] e11s = exceptedFreqs[0];

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int o11 = o11s[i];
                double e11 = e11s[i];
                ans[i] = safeLog2(safeDivide(Math.pow(o11, 2), e11)) * safeLog(o11 + 1);
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };

    public static void minSensitivity(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        // 遍历JSON数组
        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject); 

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            int[][] marginalFreqs = getFreqsMarginal(o11s, o12s, o21s, o22s);

            int[] o1xs = marginalFreqs[0];
            int[] ox1s = marginalFreqs[2];

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int o1x = o1xs[i];
                int ox1 = ox1s[i];
                int o11 = o11s[i];
                ans[i] = Math.min(safeDivide(o11, ox1), safeDivide(o11, o1x));
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };

    public static void md(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        // 遍历JSON数组
        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject); 

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            double[][] exceptedFreqs = getFreqsExpected(o11s, o12s, o21s, o22s);

            double[] e11s = exceptedFreqs[0];

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int o11 = o11s[i];
                double e11 = e11s[i];
                ans[i] = safeLog2(safeDivide(Math.pow(o11, 2), e11));
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };

    public static void me(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        // 遍历JSON数组
        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject); 

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            int[][] marginalFreqs = getFreqsMarginal(o11s, o12s, o21s, o22s);

            int[] o1xs = marginalFreqs[0];
            int[] ox1s = marginalFreqs[2];

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int o1x = o1xs[i];
                int ox1 = ox1s[i];
                int o11 = o11s[i];
                ans[i] = o11 * safeDivide(2 * o11, o1x + ox1);
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };

    public static void mi(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        // 遍历JSON数组
        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject); 

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            double[][] exceptedFreqs = getFreqsExpected(o11s, o12s, o21s, o22s);

            double[] e11s = exceptedFreqs[0];
            double[] e12s = exceptedFreqs[1];
            double[] e21s = exceptedFreqs[2];
            double[] e22s = exceptedFreqs[3];

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int o11 = o11s[i];
                int o12 = o12s[i];
                int o21 = o21s[i];
                int o22 = o22s[i];
                int oxx = o11 + o12 + o21 + o22;
                double e11 = e11s[i];
                double e12 = e12s[i];
                double e21 = e21s[i];
                double e22 = e22s[i];
                double mi11 = safeDivide(o11, oxx) * safeLog2(safeDivide(o11, e11));
                double mi12 = safeDivide(o12, oxx) * safeLog2(safeDivide(o12, e12));
                double mi21 = safeDivide(o21, oxx) * safeLog2(safeDivide(o21, e21));
                double mi22 = safeDivide(o22, oxx) * safeLog2(safeDivide(o22, e22));
                ans[i] = mi11 + mi12 + mi21 + mi22;
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };

    public static void oddsRatio(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        // 遍历JSON数组
        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject); 

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int o11 = o11s[i];
                int o12 = o12s[i];
                int o21 = o21s[i];
                int o22 = o22s[i];
                if (o11 == 0 && o12 > 0) {
                    ans[i] =  Double.NEGATIVE_INFINITY;
                } else if (o11 > 0 && o12 == 0) {
                    ans[i] =  Double.POSITIVE_INFINITY;
                } else {
                    ans[i] = safeDivide(o11 * o22, o12 * o21);
                }
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };

    public static void pmi(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        // 遍历JSON数组
        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject); 

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            double[][] exceptedFreqs = getFreqsExpected(o11s, o12s, o21s, o22s);

            double[] e11s = exceptedFreqs[0];

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int o11 = o11s[i];
                double e11 = e11s[i];
                ans[i] = safeLog2(safeDivide(o11, e11));
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };

    public static void poissonCollocationMeasure(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        // 遍历JSON数组
        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject); 

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            double[][] exceptedFreqs = getFreqsExpected(o11s, o12s, o21s, o22s);

            double[] e11s = exceptedFreqs[0];

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int o11 = o11s[i];
                int oxx = o11s[i] + o12s[i] + o21s[i] + o22s[i];
                double e11 = e11s[i];
                ans[i] = safeDivide(o11 * (safeLog(o11) - safeLog(e11) - 1), oxx);
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };

    public static void squaredPhiCoeff(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject); 

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            int[][] marginalFreqs = getFreqsMarginal(o11s, o12s, o21s, o22s);

            int[] o1xs = marginalFreqs[0];
            int[] o2xs = marginalFreqs[1];
            int[] ox1s = marginalFreqs[2];
            int[] ox2s = marginalFreqs[3];

            double[] ans = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                int o1x = o1xs[i];
                int o2x = o2xs[i];
                int ox1 = ox1s[i];
                int ox2 = ox2s[i];
                int o11 = o11s[i];
                int o12 = o12s[i];
                int o21 = o21s[i];
                int o22 = o22s[i];
                ans[i] = safeDivide(Math.pow(o11 * o22 - o12 * o21, 2), o1x * o2x * ox1 * ox2);
            }

            for (int i = 0; i < o11s.length; i++) {
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("effectSizeAlg", String.format("%.6f",ans[i]));
            }
        }
    };
}
