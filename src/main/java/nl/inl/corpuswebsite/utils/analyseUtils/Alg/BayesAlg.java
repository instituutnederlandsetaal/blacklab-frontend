package nl.inl.corpuswebsite.utils.analyseUtils.Alg;

import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static nl.inl.corpuswebsite.utils.analyseUtils.Alg.AlgUtils.*;

/**
 * ClassName: BayesAlg
 * Package: nl.inl.corpuswebsite.utils.analyseUtils.Alg
 * Description: the Bayesian Factor Algorithm implementation. The algorithm here see "wordless": https://github.com/BLKSerene/Wordless/blob/main/doc/doc.md#doc-12-4-4
 */
public class BayesAlg {
    public static void bayesLogLikelihoodRatioTest(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> oxxsByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();
        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();
        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            oxxsByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int oxx = o11 + o12 + o21 + o22;
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject);

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                oxxsByKeyword.get(keyword).add(oxx);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] oxxs = oxxsByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            double[][] expectedFreqs = getFreqsExpected(o11s, o12s, o21s, o22s);

            double[] e11s = expectedFreqs[0];
            double[] e12s = expectedFreqs[1];
            double[] e21s = expectedFreqs[2];
            double[] e22s = expectedFreqs[3];

            double[] gs = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                double gs_11 = safeLog(safeDivide(o11s[i], e11s[i])) * o11s[i];
                double gs_12 = safeLog(safeDivide(o12s[i], e12s[i])) * o12s[i];
                double gs_21 = safeLog(safeDivide(o21s[i], e21s[i])) * o21s[i];
                double gs_22 = safeLog(safeDivide(o22s[i], e22s[i])) * o22s[i];

                gs[i] = 2 * (gs_11 + gs_12 + gs_21 + gs_22);
            }

            double[] bics = new double[gs.length];

            for (int i = 0; i < gs.length; i++) {
                bics[i] = gs[i] - safeLog(oxxs[i]);

                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("bayesAlg", String.format("%.6f",bics[i]));
            }
        }
    };
}
